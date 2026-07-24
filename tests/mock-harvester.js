// Mock Harvester for Testing Sync Process Offline
const failMode = process.argv.includes('--fail');

console.log('◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]');
console.log('Starting Discovery Pass...');

setTimeout(() => {
    console.log('Scanning page 1...');
}, 400);

setTimeout(() => {
    console.log('Processing 10 issues...');
}, 800);

setTimeout(() => {
    if (failMode) {
        console.error('Error: Simulated Jira API authentication failure (HTTP 401).');
        process.exit(1);
    } else {
        console.log('Database saved successfully.');
        process.exit(0);
    }
}, 1200);
