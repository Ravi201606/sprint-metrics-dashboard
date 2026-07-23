require('dotenv').config();
const https = require('https');

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JQL = 'issueKey = ODCNG-47783';
const JIRA_FIELDS = ['customfield_12041', 'changelog'];
const options = { headers: { 'Authorization': `Bearer ${JIRA_API_TOKEN}`, 'Content-Type': 'application/json' } };

const investigateIssue = async () => {
    console.log('Investigating issue ODCNG-47783 for sprint details...');
    const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(JQL)}&fields=${JIRA_FIELDS.join(',')}&expand=changelog`;
    
    try {
        const data = await new Promise((resolve, reject) => https.get(url, options, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(`HTTP ${res.statusCode}`)));
        }).on('error', reject));

        if (!data.issues || data.issues.length === 0) {
            console.log("Could not find issue ODCNG-47783.");
            return;
        }

        const issue = data.issues[0];
        
        console.log(`\n--- Sprint Details from customfield_12041 for ${issue.key} ---`);
        if (issue.fields.customfield_12041) {
            issue.fields.customfield_12041.forEach(sprintStr => {
                console.log(sprintStr);
            });
        } else {
            console.log("No sprint data in customfield_12041.");
        }

        console.log(`\n--- Full 'Sprint' field changelog for ${issue.key} ---`);
        const sprintChanges = (issue.changelog?.histories || [])
            .flatMap(h => h.items.filter(i => i.field === 'Sprint').map(i => ({
                changed_at: h.created,
                from: i.from,
                fromString: i.fromString,
                to: i.to,
                toString: i.toString
            })));

        if (sprintChanges.length > 0) {
            console.log(JSON.stringify(sprintChanges, null, 2));
        } else {
            console.log("No 'Sprint' field changes found in the changelog.");
        }

    } catch (err) {
        console.error(`Failed to fetch issue:`, err);
    }
};

investigateIssue();
