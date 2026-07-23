require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { initializeDatabase, saveDatabase, getDb, getStatements } = require('./db.js');

// --- Configuration ---
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
let JQL = '';
let PAGE_SIZE = 5;
const DISCOVERY_PAGE_LIMIT = 1; // Max pages to scan during discovery
const SCOPE_KEY = `ODCNG::Sahyadri Dev Team`;
const JIRA_FIELDS = ['summary', 'status', 'issuetype', 'assignee', 'priority', 'created', 'updated', 'resolutiondate', 'project', 'worklog', 'customfield_12041', 'resolution', 'changelog', 'customfield_10016', 'issuelinks', 'customfield_32440', 'timeoriginalestimate', 'timespent', 'aggregatetimeoriginalestimate', 'aggregatetimespent', 'labels'];

const options = { headers: { 'Authorization': `Bearer ${JIRA_API_TOKEN}`, 'Content-Type': 'application/json' } };

function buildJql() {
    const scope = process.env.HARVEST_SCOPE || 'sprint';
    const baseJql = 'project = ODCNG AND "Affect Team" = "Sahyadri Dev Team"';

    if (scope === 'sprint') {
        const sprintNames = process.env.SPRINT_NAMES;
        if (!sprintNames) {
            console.error('Error: HARVEST_SCOPE is "sprint" but SPRINT_NAMES environment variable is not set.');
            process.exit(1);
        }
        const sprintNamesArray = sprintNames.split(',').map(name => `"${name.trim()}"`);
        return `${baseJql} AND Sprint in (${sprintNamesArray.join(',')}) ORDER BY updated DESC`;
    } else if (scope === 'year') {
        const year = process.env.YEAR_FILTER;
        if (!year) {
            console.error('Error: HARVEST_SCOPE is "year" but YEAR_FILTER environment variable is not set.');
            process.exit(1);
        }
        return `${baseJql} AND (created >= "${year}-01-01" AND created <= "${year}-12-31") ORDER BY updated DESC`;
    } else if (scope === 'full') {
        return `${baseJql} ORDER BY updated DESC`;
    } else {
        console.error(`Error: Invalid HARVEST_SCOPE: ${scope}`);
        process.exit(1);
    }
}

function buildGlobalSprintMap(allIssues) {
    const sprintNameMap = {};
    const sprintNameRegex = /name=([^,]+)/;
    const sprintIdRegex = /id=(\d+)/;
    const sprintEndDateRegex = /endDate=([^,\]]+)/;
    const sprintStartDateRegex = /startDate=([^,\]]+)/;
    const sprintCompleteDateRegex = /completeDate=([^,\]]+)/;
    const sprintStateRegex = /state=([^,\]]+)/;

    for (const issue of allIssues) {
        if (issue && issue.fields && issue.fields.customfield_12041) {
            issue.fields.customfield_12041.forEach(sprintString => {
                const idMatch = sprintString.match(sprintIdRegex);
                const nameMatch = sprintString.match(sprintNameRegex);
                const endDateMatch = sprintString.match(sprintEndDateRegex);
                const startDateMatch = sprintString.match(sprintStartDateRegex);
                const completeDateMatch = sprintString.match(sprintCompleteDateRegex);
                const stateMatch = sprintString.match(sprintStateRegex);
                if (idMatch && nameMatch) {
                    sprintNameMap[idMatch[1]] = {
                        name: nameMatch[1],
                        endDate: endDateMatch ? endDateMatch[1] : null,
                        startDate: startDateMatch ? startDateMatch[1] : null,
                        completeDate: completeDateMatch ? completeDateMatch[1] : null,
                        state: stateMatch ? stateMatch[1] : null,
                    };
                }
            });
        }
    }
    return sprintNameMap;
}

function reconstructSprintHistory(issue, sprintNameMap) {
    const issueSprints = [];

    if (!issue.changelog || !issue.changelog.histories) {
        return issueSprints;
    }

    const sprintEvents = [];
    issue.changelog.histories.forEach(h => {
        h.items.forEach(item => {
            if (item.field === 'Sprint') {
                sprintEvents.push({
                    created: new Date(h.created),
                    from: item.from,
                    to: item.to,
                    fromString: item.fromString,
                    toString: item.toString
                });
            }
        });
    });

    sprintEvents.sort((a, b) => a.created - b.created);

    for (const event of sprintEvents) {
        const oldIds = event.from ? event.from.split(',').map(s => s.trim()) : [];
        const newIds = event.to ? event.to.split(',').map(s => s.trim()) : [];

        const addedIds = newIds.filter(id => !oldIds.includes(id));
        const removedIds = oldIds.filter(id => !newIds.includes(id));

        for (const removedId of removedIds) {
            const sprint = issueSprints.reverse().find(s => s.sprint_id === removedId && !s.removed_at);
            if (sprint) {
                sprint.removed_at = event.created.toISOString();
            }
            issueSprints.reverse(); // reverse back
        }
        
        for (const addedId of addedIds) {
            const sprintDetails = sprintNameMap[addedId] || {};
            issueSprints.push({
                issue_key: issue.key,
                sprint_id: addedId,
                sprint_name: sprintDetails.name || '',
                sprint_state: sprintDetails.state || null,
                sprint_start_date: sprintDetails.startDate || null,
                sprint_end_date: sprintDetails.endDate || null,
                added_at: event.created.toISOString(),
                removed_at: null
            });
        }
    }
    
    // Handle fallback case where sprint was assigned on creation
    const changelogSprintIds = new Set(issueSprints.map(s => s.sprint_id));
    if (issue.fields.customfield_12041) {
        issue.fields.customfield_12041.forEach(sprintString => {
            const idMatch = sprintString.match(/id=(\d+)/);
            if (idMatch) {
                const sprintId = idMatch[1];
                if (!changelogSprintIds.has(sprintId)) {
                    const sprintDetails = sprintNameMap[sprintId] || {};
                    if (issue.key && issue.fields.created) {
                        issueSprints.push({
                            issue_key: issue.key,
                            sprint_id: sprintId,
                            sprint_name: sprintDetails.name || '',
                            sprint_state: sprintDetails.state || null,
                            sprint_start_date: sprintDetails.startDate || null,
                            sprint_end_date: sprintDetails.endDate || null,
                            added_at: new Date(issue.fields.created).toISOString(),
                            removed_at: null
                        });
                    }
                }
            }
        });
    }
    return issueSprints;
}

const processPage = (issues, isDiscovery, sprintNameMap) => {
    const db = getDb();
    try {
        db.exec('BEGIN');
        for (const issue of issues) {
            processIssue(issue, isDiscovery, sprintNameMap);
        }
        db.exec('COMMIT');
    } catch (err) {
        console.error(`Error processing page, rolling back transaction:`, err.message);
        db.exec('ROLLBACK');
    }
};

const processIssue = (issue, isDiscovery, sprintNameMap) => {
    const { upsertIssue, upsertWorklog, insertStatusTransition, insertIssueSprint, deleteIssueSprints } = getStatements();
    
    upsertIssue.run([
        issue.key,
        issue.fields.summary,
        issue.fields.status.name,
        issue.fields.issuetype.name,
        issue.fields.assignee ? issue.fields.assignee.displayName : null,
        issue.fields.priority ? issue.fields.priority.name : null,
        issue.fields.created,
        issue.fields.updated,
        issue.fields.resolutiondate,
        issue.fields.project.key,
        JSON.stringify(issue)
    ]);
    
    if (issue.fields.worklog && issue.fields.worklog.worklogs) {
        issue.fields.worklog.worklogs.forEach(w => upsertWorklog.run([w.id, issue.key, w.author ? w.author.displayName : 'Unknown', w.started, w.timeSpentSeconds, w.comment]));
    }

    if (issue.changelog && issue.changelog.histories) {
        issue.changelog.histories.forEach(h => {
            h.items.forEach(item => {
                if (item.field === 'status') {
                    insertStatusTransition.run([issue.key, item.fromString, item.toString, h.created]);
                }
            });
        });
    }
    
    const issueSprints = reconstructSprintHistory(issue, sprintNameMap);
    deleteIssueSprints.run([issue.key]);
    for (const sprint of issueSprints) {
        insertIssueSprint.run([sprint.issue_key, sprint.sprint_id, sprint.sprint_name, sprint.sprint_state, sprint.sprint_start_date, sprint.sprint_end_date, sprint.added_at, sprint.removed_at]);
    }
};

const fetchAllIssues = async () => {
    let allIssues = [];
    let page = 0;
    let total = 0;
    do {
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(JQL)}&startAt=${page * PAGE_SIZE}&maxResults=${PAGE_SIZE}&fields=${JIRA_FIELDS.join(',')}&expand=changelog`;
        try {
            const data = await new Promise((resolve, reject) => https.get(url, options, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(`HTTP ${res.statusCode}`)));
            }).on('error', reject));

            if (!data.issues || data.issues.length === 0) {
                break;
            }
            allIssues = allIssues.concat(data.issues);
            total = data.total;
        } catch (err) {
            console.error(`Failed to fetch page ${page + 1}:`, err);
        }
        page++;
    } while (page * PAGE_SIZE < total);
    return allIssues;
}

const fetchIssuesForDiscovery = async () => {
    console.log('Starting Discovery Pass...');
    const allIssues = await fetchAllIssues();
    const sprintNameMap = buildGlobalSprintMap(allIssues);
    
    let page = 0;
    while (page < DISCOVERY_PAGE_LIMIT) {
        console.log(`\nScanning page ${page + 1}...`);
        const startAt = page * PAGE_SIZE;
        const issues = allIssues.slice(startAt, startAt + PAGE_SIZE);
        if (issues.length === 0) {
            console.log("No more issues to scan.");
            break;
        }
        processPage(issues, true, sprintNameMap);
        page++;
    }
};

function generateDataStore() {
    const db = getDb();
    const issues = [];
    const stmt = db.prepare('SELECT raw_json FROM issues');
    while (stmt.step()) {
        const row = stmt.getAsObject();
        issues.push(JSON.parse(row.raw_json));
    }
    stmt.free();

    const dataStore = {
        issues: issues,
        generatedAt: new Date().toISOString()
    };

    const dataStoreContent = `window.jiraStore = ${JSON.stringify(dataStore, null, 2)};`;
    const dataStorePath = path.join(__dirname, '..', 'frontend', 'data-store.js');
    fs.writeFileSync(dataStorePath, dataStoreContent);
    console.log('data-store.js generated successfully.');
}

(async () => {
    JQL = buildJql();
    await initializeDatabase();
    if (process.env.DISCOVERY_ONLY === 'true') {
        PAGE_SIZE = 5;
        await fetchIssuesForDiscovery();
    } else {
        PAGE_SIZE = 50;
        console.log('Starting Full Harvest...');
        const allIssues = await fetchAllIssues();
        const sprintNameMap = buildGlobalSprintMap(allIssues);
        console.log(`\nProcessing ${allIssues.length} issues...`);
        processPage(allIssues, false, sprintNameMap);
    }
    saveDatabase();
    generateDataStore();
})().catch(err => {
    console.error("Operation failed:", err);
    process.exit(1);
});