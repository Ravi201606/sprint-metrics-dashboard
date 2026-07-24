const { getDb } = require('./db.js');

class SyncRepository {
    static async createJob(job) {
        const db = getDb();
        db.run(`
            INSERT INTO sync_jobs (id, status, started_at, finished_at, duration_seconds, success, error, exit_code, pid, progress, current_stage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `, [
            job.id,
            job.status,
            job.started_at,
            job.finished_at || null,
            job.duration_seconds || null,
            job.success !== undefined && job.success !== null ? (job.success ? 1 : 0) : null,
            job.error || null,
            job.exit_code !== undefined && job.exit_code !== null ? job.exit_code : null,
            job.pid || null,
            job.progress || 0,
            job.current_stage
        ]);
        return job;
    }

    static async updateJob(job) {
        const db = getDb();
        db.run(`
            UPDATE sync_jobs SET
                status = ?,
                finished_at = ?,
                duration_seconds = ?,
                success = ?,
                error = ?,
                exit_code = ?,
                pid = ?,
                progress = ?,
                current_stage = ?
            WHERE id = ?;
        `, [
            job.status,
            job.finished_at || null,
            job.duration_seconds || null,
            job.success !== undefined && job.success !== null ? (job.success ? 1 : 0) : null,
            job.error || null,
            job.exit_code !== undefined && job.exit_code !== null ? job.exit_code : null,
            job.pid || null,
            job.progress || 0,
            job.current_stage,
            job.id
        ]);
        return job;
    }

    static async getJob(id) {
        const db = getDb();
        const stmt = db.prepare(`SELECT * FROM sync_jobs WHERE id = ?;`);
        try {
            if (stmt.bind([id]) && stmt.step()) {
                const job = stmt.getAsObject();
                job.logs = await this.getJobLogs(id);
                return job;
            }
            return null;
        } finally {
            stmt.free();
        }
    }

    static async getLatestJob() {
        const db = getDb();
        const stmt = db.prepare(`SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT 1;`);
        try {
            if (stmt.step()) {
                const job = stmt.getAsObject();
                job.logs = await this.getJobLogs(job.id);
                return job;
            }
            return null;
        } finally {
            stmt.free();
        }
    }

    static async addLog(jobId, level, message) {
        const db = getDb();
        db.run(`
            INSERT INTO sync_job_logs (job_id, timestamp, level, message)
            VALUES (?, ?, ?, ?);
        `, [
            jobId,
            new Date().toISOString(),
            level,
            message
        ]);
    }

    static async getJobLogs(jobId) {
        const db = getDb();
        const stmt = db.prepare(`SELECT timestamp, level, message FROM sync_job_logs WHERE job_id = ? ORDER BY id ASC;`);
        const logs = [];
        try {
            stmt.bind([jobId]);
            while (stmt.step()) {
                logs.push(stmt.getAsObject());
            }
        } finally {
            stmt.free();
        }
        return logs;
    }

    static async hasRunningJob() {
        const db = getDb();
        const stmt = db.prepare(`SELECT COUNT(*) as count FROM sync_jobs WHERE status = 'RUNNING';`);
        try {
            if (stmt.step()) {
                const result = stmt.getAsObject();
                return result.count > 0;
            }
            return false;
        } finally {
            stmt.free();
        }
    }
}

module.exports = SyncRepository;
