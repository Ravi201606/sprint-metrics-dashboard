require('dotenv').config();
const https = require('https');
const { initializeDatabase, saveDatabase, getDb, getStatements } = require('./db.js');

const SPRINT_NAME = "CNG Sprint 2026-09";
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JQL = `project = ODCNG AND Sprint = "${SPRINT_NAME}" ORDER BY updated DESC`;
const JIRA_FIELDS = ['summary', 'status', 'issuetype', 'assignee', 'priority', 'created', 'updated', 'resolutiondate', 'project', 'worklog', 'customfield_12041', 'resolution'];
const options = { headers: { 'Authorization': `Bearer ${JIRA_API_TOKEN}`, 'Content-Type': 'application/json' } };

const allSprintsMap = new Map();

const processIssue = (issue) => {
    const { upsertIssue, upsertWorklog, insertStatusTransition, insertIssueSprint, deleteIssueSprints } = getStatements();
    
    upsertIssue.run(issue.key, issue.fields.summary, issue.fields.status.name, issue.fields.issuetype.name, issue.fields.assignee?.displayName, issue.fields.priority?.name, issue.fields.created, issue.fields.updated, issue.fields.resolutiondate, issue.fields.project.key, JSON.stringify(issue.fields));
    
    issue.changelog?.histories?.forEach(h => {
        h.items.forEach(item => {
            if (item.field === 'status') {
                insertStatusTransition.run(issue.key, item.fromString, item.toString, h.created);
            }
        });
    });

    deleteIssueSprints.run(issue.key);
    const sprintEvents = {};

    issue.changelog?.histories?.forEach(h => {
        h.items.forEach(item => {
            if (item.field !== 'Sprint' || (!item.from && !item.to)) return;
            const oldIds = item.from?.toString().split(',').map(s => s.trim()).filter(Boolean) || [];
            const newIds = item.to?.toString().split(',').map(s => s.trim()).filter(Boolean) || [];
            
            const added = newIds.filter(id => !oldIds.includes(id));
            const removed = oldIds.filter(id => !newIds.includes(id));

            added.forEach(id => {
                if (!sprintEvents[id]) sprintEvents[id] = [];
                sprintEvents[id].push({ type: 'add', date: h.created });
            });
            removed.forEach(id => {
                if (!sprintEvents[id]) sprintEvents[id] = [];
                sprintEvents[id].push({ type: 'remove', date: h.created });
            });
        });
    });

    (issue.fields.customfield_12041 || []).forEach(sprintStr => {
        const id = sprintStr.match(/id=(\d+)/)?.[1];
        if (id && !sprintEvents[id]?.some(e => e.type === 'add')) {
            if (!sprintEvents[id]) sprintEvents[id] = [];
            sprintEvents[id].push({ type: 'add', date: issue.fields.created, inferred: true });
        }
    });

    for (const sprintId in sprintEvents) {
        const events = sprintEvents[sprintId].sort((a, b) => new Date(a.date) - new Date(b.date));
        let lastAddDate = null;

        events.forEach(event => {
            if (event.type === 'add') {
                lastAddDate = event.date;
            } else if (event.type === 'remove' && lastAddDate) {
                const sprintDetails = allSprintsMap.get(sprintId) || {};
                insertIssueSprint.run(issue.key, sprintId, sprintDetails.name, sprintDetails.state, sprintDetails.startDate, sprintDetails.endDate, lastAddDate, event.date);
                lastAddDate = null;
            }
        });
        if (lastAddDate) {
            const sprintDetails = allSprintsMap.get(sprintId) || {};
            insertIssueSprint.run(issue.key, sprintId, sprintDetails.name, sprintDetails.state, sprintDetails.startDate, sprintDetails.endDate, lastAddDate, null);
        }
    }
};

const fetchIssues = async () => {
    await initializeDatabase();
    console.log(`Starting focused harvest for sprint: "${SPRINT_NAME}"`);

    const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(JQL)}&maxResults=200&fields=${JIRA_FIELDS.join(',')}&expand=changelog`;
    
    const data = await new Promise((resolve, reject) => https.get(url, options, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(`HTTP ${res.statusCode}`)));
    }).on('error', reject));

    const issues = data.issues || [];
    if (issues.length > 0) {
        console.log(`Found ${issues.length} issues. Pre-processing sprints...`);
        issues.forEach(issue => {
            (issue.fields.customfield_12041 || []).forEach(sprintStr => {
                const id = sprintStr.match(/id=(\d+)/)?.[1];
                if (id && !allSprintsMap.has(id)) {
                    const name = sprintStr.match(/name=([^,\]]+)/)?.[1];
                    const state = sprintStr.match(/state=([^,\]]+)/)?.[1];
                    const startDate = sprintStr.match(/startDate=([^,\]]+)/)?.[1];
                    const endDate = sprintStr.match(/completeDate=([^,\]]+)/)?.[1] || sprintStr.match(/endDate=([^,\]]+)/)?.[1];
                    allSprintsMap.set(id, { name, state, startDate, endDate });
                }
            });
        });
        
        console.log("Processing issues...");
        const db = getDb();
        try {
            db.exec('BEGIN');
            for (const issue of issues) {
                processIssue(issue);
            }
            db.exec('COMMIT');
        } catch (err) {
            console.error(`Error processing page:`, err.message);
            db.exec('ROLLBACK');
        }

        saveDatabase();
        console.log('Focused harvest complete.');
    } else {
        console.log('No issues found for this sprint.');
    }
};

fetchIssues().catch(err => {
    console.error("Harvesting failed:", err);
    process.exit(1);
});
