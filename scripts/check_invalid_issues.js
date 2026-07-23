
global.window = {};
require('../src/frontend/data-store.js');

const dataStore = window.jiraStore;

let invalidIssues = 0;
dataStore.issues.forEach((issue, index) => {
    if (!issue || !issue.fields) {
        console.log(`Issue at index ${index} is invalid.`);
        invalidIssues++;
    }
});

if (invalidIssues > 0) {
    console.log(`Found ${invalidIssues} invalid issues.`);
} else {
    console.log('All issues seem to be valid.');
}
