const { spawn } = require('child_process');
const path = require('path');
const SyncRepository = require('./sync-repository.js');
const { reloadDatabase, saveDatabase } = require('./db.js');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

class SyncManager {
    constructor() {
        this.activeJob = null;
        this.logLimit = 100;
    }

    async getStatus(jobId = null) {
        // If there is an active running job in-memory, serve that directly for real-time progress and stream logs!
        if (this.activeJob && (!jobId || this.activeJob.id === jobId)) {
            return this.activeJob;
        }

        if (jobId) {
            return await SyncRepository.getJob(jobId);
        }

        // Return latest completed/failed or running job from db
        return await SyncRepository.getLatestJob();
    }

    async startSync() {
        // Concurrency Guard
        const isDbRunning = await SyncRepository.hasRunningJob();
        if (this.activeJob || isDbRunning) {
            console.log('Sync already running. Rejecting concurrent start request.');
            const currentJob = this.activeJob || await SyncRepository.getLatestJob();
            return {
                ok: true,
                message: 'Sync already running.',
                jobId: currentJob ? currentJob.id : null,
                alreadyRunning: true
            };
        }

        const jobId = `sync_${Date.now()}`;
        const startedAt = new Date().toISOString();

        // 1. Initialize Active Job in Memory & Database
        const job = {
            id: jobId,
            status: 'RUNNING',
            started_at: startedAt,
            finished_at: null,
            duration_seconds: 0,
            success: null,
            error: null,
            exit_code: null,
            pid: null,
            progress: 0,
            current_stage: 'STARTING',
            logs: []
        };

        this.activeJob = job;

        // Persist initial job record to db before spawning, so if harvester crashes immediately or we read from disk, it's there
        await SyncRepository.createJob(job);
        this.appendSystemLog(jobId, 'Sync started initialization.');
        saveDatabase(); // Commit RUNNING state to disk

        // 2. Spawn Harvester
        const useMock = process.env.USE_MOCK_HARVESTER === 'true';
        const harvesterPath = useMock ? 'tests/mock-harvester.js' : 'src/backend/harvester.js';
        const args = [harvesterPath];
        if (useMock && process.env.MOCK_HARVESTER_FAIL === 'true') {
            args.push('--fail');
        }

        const env = { ...process.env, DISCOVERY_ONLY: 'true' };
        const child = spawn('node', args, { cwd: PROJECT_ROOT, env });
        
        job.pid = child.pid || null;
        this.appendSystemLog(jobId, `Harvester process spawned (PID: ${job.pid || 'n/a'}).`);
        await SyncRepository.updateJob(job);

        child.stdout.on('data', data => this.handleProcessOutput(jobId, 'stdout', data));
        child.stderr.on('data', data => this.handleProcessOutput(jobId, 'stderr', data));

        child.on('error', async (err) => {
            await this.handleProcessFailure(jobId, err.message, -1);
        });

        child.on('close', async (code) => {
            if (code === 0) {
                await this.handleProcessSuccess(jobId);
            } else {
                await this.handleProcessFailure(jobId, `Harvester process exited with code ${code}`, code);
            }
        });

        return {
            ok: true,
            message: 'Sync started.',
            jobId: jobId,
            alreadyRunning: false
        };
    }

    handleProcessOutput(jobId, source, data) {
        if (!this.activeJob || this.activeJob.id !== jobId) return;

        const timestamp = new Date().toISOString();
        const lines = data.toString().split(/\r?\n/).map(line => line.trim()).filter(Boolean);

        for (const line of lines) {
            // Append to in-memory logs
            this.activeJob.logs.push({ timestamp, level: source, message: line });
            
            // Limit in-memory log buffer size to keep heap lean
            if (this.activeJob.logs.length > this.logLimit) {
                this.activeJob.logs.shift();
            }

            // Real-time stage tracking based on stdout logs
            if (source === 'stdout') {
                if (line.includes('Starting Discovery Pass...') || line.includes('Starting Full Harvest...')) {
                    this.activeJob.current_stage = 'CONNECTING';
                    this.activeJob.progress = 10;
                } else if (line.includes('Scanning page') || line.includes('Scanning') || line.includes('Fetching page') || line.includes('Fetching')) {
                    this.activeJob.current_stage = 'FETCHING_ISSUES';
                    this.activeJob.progress = 45;
                } else if (line.includes('Processing') || line.includes('Processing page')) {
                    this.activeJob.current_stage = 'PROCESSING';
                    this.activeJob.progress = 75;
                } else if (line.includes('Database saved successfully')) {
                    this.activeJob.current_stage = 'WRITING_DATABASE';
                    this.activeJob.progress = 90;
                }
            }
        }

        // Calculate running duration
        const start = Date.parse(this.activeJob.started_at);
        this.activeJob.duration_seconds = Math.floor((Date.now() - start) / 1000);
    }

    appendSystemLog(jobId, message) {
        const timestamp = new Date().toISOString();
        if (this.activeJob && this.activeJob.id === jobId) {
            this.activeJob.logs.push({ timestamp, level: 'system', message });
            if (this.activeJob.logs.length > this.logLimit) {
                this.activeJob.logs.shift();
            }
        }
    }

    async handleProcessSuccess(jobId) {
        if (!this.activeJob || this.activeJob.id !== jobId) return;

        const finishedAt = new Date().toISOString();
        const duration = Math.floor((Date.parse(finishedAt) - Date.parse(this.activeJob.started_at)) / 1000);

        this.appendSystemLog(jobId, 'Harvester completed successfully on disk.');
        this.activeJob.current_stage = 'REFRESHING_DATABASE';
        this.activeJob.progress = 95;

        try {
            // Reload the newly written metrics.db into memory so the gateway can serve new data!
            await reloadDatabase();
            
            // Now that database is reloaded, save our final active job details & logs to database safely
            this.activeJob.status = 'COMPLETED';
            this.activeJob.current_stage = 'COMPLETED';
            this.activeJob.progress = 100;
            this.activeJob.finished_at = finishedAt;
            this.activeJob.duration_seconds = duration;
            this.activeJob.success = true;
            this.activeJob.exit_code = 0;

            await SyncRepository.updateJob(this.activeJob);
            
            // Batch insert all the logs we collected in-memory
            for (const log of this.activeJob.logs) {
                await SyncRepository.addLog(jobId, log.level, log.message);
            }

            // Save our new sync job state to database on disk!
            saveDatabase();
            console.log(`Sync Job ${jobId} successfully written and saved to persisted database.`);
        } catch (err) {
            console.error('Failed to post-process successful sync job database reload:', err);
            await this.handleProcessFailure(jobId, `DB Refresh Failure: ${err.message}`, -2);
            return;
        } finally {
            this.activeJob = null;
        }
    }

    async handleProcessFailure(jobId, errorMessage, code) {
        if (!this.activeJob || this.activeJob.id !== jobId) return;

        const finishedAt = new Date().toISOString();
        const duration = Math.floor((Date.parse(finishedAt) - Date.parse(this.activeJob.started_at)) / 1000);

        this.appendSystemLog(jobId, `Sync failed: ${errorMessage}`);
        
        try {
            // Even if failed, let's reload database just in case to sync connection state with any on-disk rollback
            await reloadDatabase();

            this.activeJob.status = 'FAILED';
            this.activeJob.current_stage = 'FAILED';
            this.activeJob.progress = 100;
            this.activeJob.finished_at = finishedAt;
            this.activeJob.duration_seconds = duration;
            this.activeJob.success = false;
            this.activeJob.exit_code = code;
            this.activeJob.error = errorMessage;

            await SyncRepository.updateJob(this.activeJob);
            
            for (const log of this.activeJob.logs) {
                await SyncRepository.addLog(jobId, log.level, log.message);
            }

            saveDatabase();
            console.log(`Sync Job ${jobId} failed with exit code ${code} and written to database.`);
        } catch (err) {
            console.error('Failed to save failed sync job state:', err);
        } finally {
            this.activeJob = null;
        }
    }
}

// Singleton SyncManager Export
module.exports = new SyncManager();
