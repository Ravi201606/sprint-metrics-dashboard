const { initializeDatabase, getDb } = require('./db.js');

async function findIssue() {
    try {
        await initializeDatabase();
        const db = getDb();
        const stmt = db.prepare(`
            SELECT issue_key, COUNT(*) as sprint_count 
            FROM issue_sprints 
            GROUP BY issue_key 
            HAVING sprint_count > 1 
            LIMIT 1;
        `);
        const result = stmt.getAsObject();
        stmt.free();

        if (result && result.issue_key) {
            console.log(`Found issue with multiple sprints: ${result.issue_key}`);
            
            // Now, let's get the changelog for this issue from the raw_json in the issues table.
            const issueStmt = db.prepare(`SELECT raw_json FROM issues WHERE key = ?`);
            const issueRow = issueStmt.getAsObject({ ':key': result.issue_key });
            issueStmt.free();

            if (issueRow) {
                const issueData = JSON.parse(issueRow.raw_json);
                const sprintChanges = issueData.changelog.histories.filter(h => h.items.some(i => i.field === 'Sprint'));
                
                console.log(`\n--- Raw Changelog for 'Sprint' field changes on ${result.issue_key} ---`);
                console.log(JSON.stringify(sprintChanges, null, 2));
            } else {
                 console.log(`Could not find raw issue data for ${result.issue_key} in the database.`);
            }

        } else {
            console.log('No issue with multiple sprints found in the database. The previous harvest may not have processed any.');
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

findIssue();
