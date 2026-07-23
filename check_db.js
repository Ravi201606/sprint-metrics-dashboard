const { initializeDatabase, getDb } = require('./db.js');

async function checkDb() {
    try {
        await initializeDatabase();
        const db = getDb();
        const res = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table';");
        console.log(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error('Error checking database:', err);
    }
}

checkDb();
