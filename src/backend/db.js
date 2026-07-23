const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbFilePath = path.join(__dirname, '..', '..', 'database', 'metrics.db');
const schemaFilePath = path.join(__dirname, '..', '..', 'database', 'schema.sql');

let db = null;
let statements = {};

async function initializeDatabase() {
    if (db) return db;

    const SQL = await initSqlJs({ locateFile: () => path.join(__dirname, '..', '..', 'sql-wasm.wasm') });
    if (fs.existsSync(dbFilePath)) {
        const fileBuffer = fs.readFileSync(dbFilePath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
        const schema = fs.readFileSync(schemaFilePath, 'utf8');
        db.run(schema);
        console.log('New database created and schema applied.');
    }

    prepareStatements();
    return db;
}

function prepareStatements() {
    statements.upsertIssue = db.prepare(`
        INSERT INTO issues (key, summary, status, issuetype, assignee, priority, created, updated, resolutiondate, project, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
        summary=excluded.summary, status=excluded.status, issuetype=excluded.issuetype, assignee=excluded.assignee, priority=excluded.priority,
        created=excluded.created, updated=excluded.updated, resolutiondate=excluded.resolutiondate, project=excluded.project, raw_json=excluded.raw_json;
    `);

    statements.upsertWorklog = db.prepare(`
        INSERT INTO worklogs (id, issue_key, author, started, time_spent_seconds, comment)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
        issue_key=excluded.issue_key, author=excluded.author, started=excluded.started, time_spent_seconds=excluded.time_spent_seconds, comment=excluded.comment;
    `);

    statements.insertStatusTransition = db.prepare(`
        INSERT INTO status_transitions (issue_key, from_status, to_status, changed_at)
        VALUES (?, ?, ?, ?);
    `);
    
    statements.insertIssueSprint = db.prepare(`
        INSERT INTO issue_sprints (issue_key, sprint_id, sprint_name, sprint_state, sprint_start_date, sprint_end_date, added_at, removed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);
    
    statements.deleteIssueSprints = db.prepare(`DELETE FROM issue_sprints WHERE issue_key = ?;`);


    statements.getSyncState = db.prepare(`SELECT last_synced_at FROM sync_state WHERE scope = ?;`);
    statements.setSyncState = db.prepare(`
        INSERT INTO sync_state (scope, last_synced_at)
        VALUES (?, ?)
        ON CONFLICT(scope) DO UPDATE SET last_synced_at=excluded.last_synced_at;
    `);
}


function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbFilePath, buffer);
        console.log('Database saved successfully.');
    }
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase first.');
    }
    return db;
}

function getStatements() {
    return statements;
}

if (require.main === module) {
    initializeDatabase().then(() => {
        saveDatabase();
        console.log('Database file created/loaded successfully.');
    }).catch(err => {
        console.error('Error initializing database:', err);
    });
}

module.exports = {
    initializeDatabase,
    saveDatabase,
    getDb,
    getStatements
};
