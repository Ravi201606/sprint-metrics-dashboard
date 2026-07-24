const { initializeDatabase, getDb } = require('../src/backend/db.js');

async function readIssues() {
    await initializeDatabase();
    const db = getDb();
    const stmt = db.prepare('SELECT raw_json FROM issues');
    const issues = [];

    try {
        while (stmt.step()) {
            const row = stmt.getAsObject();
            if (!row.raw_json) continue;
            try {
                issues.push(JSON.parse(row.raw_json));
            } catch (err) {
                console.log('Skipping invalid raw_json row:', err.message);
            }
        }
    } finally {
        stmt.free();
    }

    return issues;
}

(async () => {
    const issues = await readIssues();
    let invalidIssues = 0;

    issues.forEach((issue, index) => {
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
})().catch((err) => {
    console.error('Failed to validate issues:', err.message);
    process.exit(1);
});
