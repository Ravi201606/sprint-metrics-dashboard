const { initializeDatabase, getDb } = require('./db.js');

const checkSprints = async () => {
    try {
        await initializeDatabase();
        const db = getDb();
        const res = db.exec("SELECT DISTINCT sprint_name FROM issue_sprints");
        console.log(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error('Error checking sprints:', err);
    }
}

checkSprints();
