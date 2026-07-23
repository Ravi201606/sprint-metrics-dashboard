const { initializeDatabase, getDb } = require('../src/backend/db.js');

async function checkData() {
    await initializeDatabase();
    const db = getDb();
    const stmt = db.prepare('SELECT raw_json FROM issues LIMIT 5');
    while (stmt.step()) {
        const row = stmt.getAsObject();
        const issue = JSON.parse(row.raw_json);
        console.log(`Issue: ${issue.key}`);
        console.log('  Original Estimate:', issue.fields.timeoriginalestimate);
        console.log('  Time Spent:', issue.fields.timespent);
        console.log('  Aggregate Original Estimate:', issue.fields.aggregatetimeoriginalestimate);
        console.log('  Aggregate Time Spent:', issue.fields.aggregatetimespent);
    }
    stmt.free();
}

checkData().catch(err => {
    console.error(err);
    process.exit(1);
});