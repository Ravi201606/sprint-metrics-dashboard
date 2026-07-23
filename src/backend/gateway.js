const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 9000;
const FALLBACK_PORT = 9090;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const server = http.createServer((req, res) => {
    if (req.url === '/sync') {
        console.log('Sync endpoint hit');
        const env = { ...process.env, DISCOVERY_ONLY: 'true' };
        exec('node src/backend/harvester.js', { cwd: PROJECT_ROOT, env: env }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing harvester: ${error}`);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }
            console.log(`Harvester output: ${stdout}`);
            if (stderr) {
                console.error(`Harvester error: ${stderr}`);
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Sync initiated');
        });
    } else {
        let filePath = req.url === '/'
            ? path.join(PROJECT_ROOT, 'src', 'frontend', 'portal.html')
            : path.join(PROJECT_ROOT, req.url);

        const extname = path.extname(filePath);
        let contentType = 'text/html';
        switch (extname) {
            case '.js':
                contentType = 'text/javascript';
                break;
            case '.css':
                contentType = 'text/css';
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
