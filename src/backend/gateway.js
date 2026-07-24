const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { initializeDatabase, getDb } = require('./db.js');

const PORT = 9000;
const FALLBACK_PORT = 9090;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DB_FILE_PATH = path.join(PROJECT_ROOT, 'database', 'metrics.db');

const SYNC_LOG_LIMIT = 100;
const syncState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    success: null,
    error: null,
    exitCode: null,
    pid: null,
    logs: []
};

function writeJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function issueHasSprint(issue, sprintId) {
    const sprintEntries = issue && issue.fields ? issue.fields.customfield_12041 : null;
    if (!Array.isArray(sprintEntries)) {
        return false;
    }

    return sprintEntries.some((entry) => {
        if (typeof entry !== 'string') {
            return false;
        }
        const match = entry.match(/id=(\d+)/);
        return Boolean(match && match[1] === sprintId);
    });
}

async function getIssuesFromDatabase(filterSprintId) {
    if (!fs.existsSync(DB_FILE_PATH)) {
        throw new Error('metrics.db not found. Run sync to populate database first.');
    }

    await initializeDatabase();
    const db = getDb();
    const stmt = db.prepare('SELECT raw_json FROM issues');
    const issues = [];

    try {
        while (stmt.step()) {
            const row = stmt.getAsObject();
            if (!row.raw_json) {
                continue;
            }

            let issue;
            try {
                issue = JSON.parse(row.raw_json);
            } catch (parseError) {
                console.warn('Skipping issue due to invalid raw_json payload:', parseError.message);
                continue;
            }

            if (filterSprintId && !issueHasSprint(issue, filterSprintId)) {
                continue;
            }

            issues.push(issue);
        }
    } finally {
        stmt.free();
    }

    return issues;
}

function appendSyncLog(source, chunk) {
    const lines = chunk.toString().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
        syncState.logs.push({ at: new Date().toISOString(), source, message: line });
    }
    if (syncState.logs.length > SYNC_LOG_LIMIT) {
        syncState.logs.splice(0, syncState.logs.length - SYNC_LOG_LIMIT);
    }
}

function getSyncStatus() {
    const now = Date.now();
    const started = syncState.startedAt ? Date.parse(syncState.startedAt) : null;
    const finished = syncState.finishedAt ? Date.parse(syncState.finishedAt) : null;
    const durationSeconds = started
        ? Math.floor(((syncState.running ? now : (finished || now)) - started) / 1000)
        : null;

    return {
        running: syncState.running,
        startedAt: syncState.startedAt,
        finishedAt: syncState.finishedAt,
        durationSeconds,
        success: syncState.success,
        error: syncState.error,
        exitCode: syncState.exitCode,
        pid: syncState.pid,
        recentLogs: syncState.logs.slice(-15)
    };
}

function startSyncJob() {
    if (syncState.running) {
        return false;
    }

    const env = { ...process.env, DISCOVERY_ONLY: 'true' };
    syncState.running = true;
    syncState.startedAt = new Date().toISOString();
    syncState.finishedAt = null;
    syncState.success = null;
    syncState.error = null;
    syncState.exitCode = null;
    syncState.logs = [];

    const child = spawn('node', ['src/backend/harvester.js'], { cwd: PROJECT_ROOT, env });
    syncState.pid = child.pid || null;
    appendSyncLog('system', `Sync started (pid=${syncState.pid || 'n/a'})`);

    child.stdout.on('data', data => appendSyncLog('stdout', data));
    child.stderr.on('data', data => appendSyncLog('stderr', data));

    child.on('error', (err) => {
        syncState.running = false;
        syncState.finishedAt = new Date().toISOString();
        syncState.success = false;
        syncState.exitCode = -1;
        syncState.error = err.message;
        appendSyncLog('system', `Sync process error: ${err.message}`);
    });

    child.on('close', (code) => {
        syncState.running = false;
        syncState.finishedAt = new Date().toISOString();
        syncState.exitCode = code;
        syncState.success = code === 0;
        if (code !== 0 && !syncState.error) {
            syncState.error = `Harvester exited with code ${code}`;
        }
        appendSyncLog('system', `Sync finished with exit code ${code}`);
        syncState.pid = null;
    });

    return true;
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = requestUrl.pathname;

    if (pathname === '/sync') {
        console.log('Sync endpoint hit');
        if (syncState.running) {
            writeJson(res, 202, { ok: true, message: 'Sync already running.', status: getSyncStatus() });
            return;
        }

        startSyncJob();
        writeJson(res, 202, { ok: true, message: 'Sync started.', status: getSyncStatus() });
    } else if (pathname === '/api/issues') {
        const sprintId = requestUrl.searchParams.get('sprintId');
        getIssuesFromDatabase(sprintId)
            .then((issues) => {
                writeJson(res, 200, { issues });
            })
            .catch((err) => {
                console.error('Failed to load issues from database:', err);
                writeJson(res, 500, {
                    error: 'Failed to load issues from database.',
                    details: err.message
                });
            });
    } else if (pathname === '/sync/status') {
        writeJson(res, 200, { ok: true, status: getSyncStatus() });
    } else {
        const relativePath = pathname === '/'
            ? path.join('src', 'frontend', 'portal.html')
            : pathname.replace(/^\/+/, '');
        const filePath = path.resolve(PROJECT_ROOT, relativePath);

        if (!filePath.startsWith(PROJECT_ROOT)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        const extname = path.extname(filePath);
        let contentType = 'text/html';
        switch (extname) {
            case '.js':
                contentType = 'text/javascript';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.json':
                contentType = 'application/json';
                break;
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code == 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && e.port === PORT) {
        console.log(`Port ${PORT} is in use, trying port ${FALLBACK_PORT}`);
        server.listen(FALLBACK_PORT);
    } else {
        console.error('Server error:', e);
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${server.address().port}/`);
});
