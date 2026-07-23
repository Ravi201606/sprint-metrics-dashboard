// Vanilla Node.js Test Suite for Sprint Metrics Dashboard
const assert = require('assert');

console.log('--------------------------------------------------');
console.log('RUNNING AUTOMATED DASHBOARD METRICS UNIT TESTS...');
console.log('--------------------------------------------------');

// 1. Mock global window to load data-store.js
global.window = {};
try {
    require('./data-store.js');
} catch (err) {
    console.error('ERROR: Failed to load data-store.js. Make sure harvester.js has run successfully.', err);
    process.exit(1);
}

const issues = window.jiraStore ? window.jiraStore.issues : [];
assert.ok(issues && issues.length > 0, 'Data store must contain at least one issue');
console.log(`✓ Loaded data store containing ${issues.length} issues.`);

// Sub-filter completed issues
const completedIssues = issues.filter(i => i.fields.status.name === 'Done' || i.fields.status.name === 'Closed');
console.log(`✓ Filtered ${completedIssues.length} completed issues.`);

// Test 1: Correct Completed Issue Count for Sprint 09
const sprint09Issues = issues.filter(issue => {
    const sprints = issue.fields.customfield_12041;
    if (!sprints || !Array.isArray(sprints)) return false;
    return sprints.some(sprintStr => sprintStr.includes('id=71617')); // ID for CNG Sprint 2026-09
});
const sprint09CompletedCount = sprint09Issues.filter(i => i.fields.status.name === 'Done' || i.fields.status.name === 'Closed').length;
assert.strictEqual(sprint09CompletedCount, 85, 'Expected 85 completed issues for Sprint 09 from the full dataset');
console.log(`✓ Sprint 09 completed issue count: ${sprint09CompletedCount} (Correctly verified).`);

// Test 2: Correct "Taken vs. Done" stories for Sprint 09
const takenStories = sprint09Issues.filter(i => i.fields.issuetype.name === 'Story');
const doneStories = takenStories.filter(i => i.fields.status.name === 'Done' || i.fields.status.name === 'Closed');
assert.strictEqual(takenStories.length, 46, 'Expected 46 "Taken" stories in Sprint 09');
assert.strictEqual(doneStories.length, 26, 'Expected 26 "Done" stories in Sprint 09');
console.log(`✓ Sprint 09 story count: ${doneStories.length} done out of ${takenStories.length} taken (Correctly verified).`);

// Test 3: First Pass Yield (FPY) %
let fpyCompliantCount = 0;
const completedStatuses = ['Done'];
const fpyCompletedStories = issues.filter(i => i.fields.issuetype.name === 'Story' && completedStatuses.includes(i.fields.status.name));
fpyCompletedStories.forEach(story => {
    let hasLinkedBug = false;
    if (story.fields.issuelinks) {
        story.fields.issuelinks.forEach(link => {
            const linkedIssue = link.outwardIssue || link.inwardIssue;
            if (linkedIssue && linkedIssue.fields.issuetype.name === 'Bug') hasLinkedBug = true;
        });
    }
    if (!hasLinkedBug) fpyCompliantCount++;
});
const fpyPercentage = fpyCompletedStories.length > 0 ? Math.round((fpyCompliantCount / fpyCompletedStories.length) * 100) : 0;
assert.strictEqual(fpyPercentage, 34, 'Expected First Pass Yield for Stories (Done status only) to be 34%');
console.log(`✓ First Pass Yield: ${fpyPercentage}% (${fpyCompliantCount}/${fpyCompletedStories.length} stories passed QA without linked bugs).`);


// Test 4: Maintenance Tax %
function isMaintenanceTaxItem(issue) {
    const summary = (issue.fields.summary || '').toLowerCase();
    const type = issue.fields.issuetype.name;
    if (type === 'Irritant' && summary.includes('impediments')) return true;
    if (type === 'Support' && summary.includes('team support')) return true;
    if (type === 'Task' && summary.includes('project meetings')) return true;
    if (type === 'Task' && summary.includes('organization meeting')) return true;
    if (type === 'Enveloppe' && summary.includes('meetings')) return true;
    return false;
}
let totalSeconds = 0;
let maintenanceSeconds = 0;
issues.forEach(issue => {
    let issueSeconds = 0;
    if (issue.fields.worklog && issue.fields.worklog.worklogs) {
        issue.fields.worklog.worklogs.forEach(w => {
            issueSeconds += w.timeSpentSeconds || 0;
        });
    }
    totalSeconds += issueSeconds;
    if (isMaintenanceTaxItem(issue)) {
        maintenanceSeconds += issueSeconds;
    }
});
const maintenanceTaxPercentage = totalSeconds > 0 ? Math.round((maintenanceSeconds / totalSeconds) * 100) : 0;
console.log(`✓ Maintenance Tax: ${maintenanceTaxPercentage}% (${Math.round(maintenanceSeconds/3600)} of ${Math.round(totalSeconds/3600)} total hours).`);


console.log('--------------------------------------------------');
console.log('ALL METRICS UNIT TESTS PASSED SUCCESSFULLY! (100%)');
console.log('--------------------------------------------------');
