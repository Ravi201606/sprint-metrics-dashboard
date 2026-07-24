const http = require('http');
const fs = require('fs');
const path = require('path');
const { initializeDatabase, getDb } = require('./db.js');
const syncManager = require('./sync-manager.js');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9000;
const FALLBACK_PORT = process.env.FALLBACK_PORT ? parseInt(process.env.FALLBACK_PORT, 10) : 9090;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DB_FILE_PATH = path.join(PROJECT_ROOT, 'database', 'metrics.db');

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

function mapJobToLegacyStatus(job) {
    if (!job) {
        return {
            running: false,
            startedAt: null,
            finishedAt: null,
            durationSeconds: null,
            success: null,
            error: null,
            exitCode: null,
            pid: null,
            recentLogs: []
        };
    }

    const mappedLogs = (job.logs || []).map(log => ({
        at: log.timestamp,
        source: log.level,
        message: log.message
    }));

    return {
        running: job.status === 'RUNNING',
        startedAt: job.started_at,
        finishedAt: job.finished_at,
        durationSeconds: job.duration_seconds,
        success: job.success === 1 ? true : (job.success === 0 ? false : null),
        error: job.error,
        exitCode: job.exit_code,
        pid: job.pid,
        recentLogs: mappedLogs.slice(-15) // Keep last 15 logs for UI compatibility
    };
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = requestUrl.pathname;

    if (pathname === '/sync') {
        console.log('Sync endpoint hit');
        
        syncManager.startSync()
            .then((result) => {
                syncManager.getStatus(result.jobId)
                    .then((job) => {
                        const statusCode = result.alreadyRunning ? 202 : 202; // Always return 202 per specification for start requests
                        writeJson(res, statusCode, {
                            ok: true,
                            message: result.alreadyRunning ? 'Sync already running.' : 'Sync started.',
                            status: mapJobToLegacyStatus(job)
                        });
                    });
            })
            .catch((err) => {
                console.error('Failed to process sync request:', err);
                writeJson(res, 500, {
                    error: 'Failed to trigger sync job.',
                    details: err.message
                });
            });

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
        const jobId = requestUrl.searchParams.get('jobId');
        syncManager.getStatus(jobId)
            .then((job) => {
                writeJson(res, 200, {
                    ok: true,
                    status: mapJobToLegacyStatus(job)
                });
            })
            .catch((err) => {
                console.error('Failed to get sync status:', err);
                writeJson(res, 500, {
                    error: 'Failed to fetch sync job status.',
                    details: err.message
                });
            });

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

initializeDatabase()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${server.address().port}/`);
        });
    })
    .catch((err) => {
        console.error('Failed to initialize database on startup:', err);
        process.exit(1);
    });
