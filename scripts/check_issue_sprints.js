const { initializeDatabase, getDb } = require('./db.js');

async function checkIssueSprints() {
    try {
        await initializeDatabase();
        const db = getDb();
        const res = db.exec('SELECT * FROM issue_sprints LIMIT 5');
        if (res.length > 0) {
            // result is an array of objects, each with columns and values
            const rows = res[0].values.map(row => {
                const rowObject = {};
                res[0].columns.forEach((col, index) => {
                    rowObject[col] = row[index];
                });
                return rowObject;
            });
            console.log(JSON.stringify(rows, null, 2));
        } else {
            console.log("No results found in issue_sprints table.");
        }
    } catch (err) {
        console.error('Error checking issue_sprints:', err);
    }
}

checkIssueSprints();
