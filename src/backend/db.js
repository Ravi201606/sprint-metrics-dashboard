const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbFilePath = path.join(__dirname, '..', '..', 'database', 'metrics.db');
const schemaFilePath = path.join(__dirname, '..', '..', 'database', 'schema.sql');

let db = null;
let statements = {};

function ensureIndexes() {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_status_transitions_unique ON status_transitions(issue_key, from_status, to_status, changed_at);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_status_transitions_issue_key ON status_transitions(issue_key);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_issue_sprints_issue_key ON issue_sprints(issue_key);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_issue_sprints_sprint_name ON issue_sprints(sprint_name);`);

    // Create sync_jobs table if it does not exist
    db.run(`
        CREATE TABLE IF NOT EXISTS sync_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            duration_seconds INTEGER,
            success INTEGER,
            error TEXT,
            exit_code INTEGER,
            pid INTEGER,
            progress INTEGER DEFAULT 0,
            current_stage TEXT NOT NULL
        );
    `);

    // Create sync_job_logs table if it does not exist
    db.run(`
        CREATE TABLE IF NOT EXISTS sync_job_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES sync_jobs(id) ON DELETE CASCADE
        );
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_sync_job_logs_job_id ON sync_job_logs(job_id);`);

    // Clean up any dangling RUNNING sync jobs left over from a previous server crash or abort
    try {
        db.run(`UPDATE sync_jobs SET status = 'FAILED', current_stage = 'FAILED', error = 'Server restarted while job was running.' WHERE status = 'RUNNING';`);
    } catch (err) {
        console.warn('Error during startup sync job cleanup:', err.message);
    }
}

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

    ensureIndexes();

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
        INSERT OR IGNORE INTO status_transitions (issue_key, from_status, to_status, changed_at)
        VALUES (?, ?, ?, ?);
    `);
    
    statements.deleteStatusTransitions = db.prepare(`DELETE FROM status_transitions WHERE issue_key = ?;`);
    
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

function freeStatements() {
    for (const key of Object.keys(statements)) {
        if (statements[key] && typeof statements[key].free === 'function') {
            try {
                statements[key].free();
            } catch (err) {
                console.warn(`Error freeing statement ${key}:`, err.message);
            }
        }
    }
    statements = {};
}

async function reloadDatabase() {
    console.log('Reloading database from disk...');
    
    // Free existing prepared statements to prevent memory leaks or sql.js errors
    freeStatements();
    
    if (db) {
        try {
            db.close();
        } catch (err) {
            console.warn('Error closing old database instance:', err.message);
        }
        db = null;
    }

    // Force re-initialization which will load the updated file from disk
    await initializeDatabase();
    console.log('Database successfully reloaded and statements prepared.');
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
    reloadDatabase,
    getDb,
    getStatements
};
