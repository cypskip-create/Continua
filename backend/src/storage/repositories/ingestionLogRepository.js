import { query } from "../db.js";
export const ingestionLogRepository = {
    async log(record) {
        await query(`INSERT INTO market.ingestion_logs (exchange, dataset, status, record_count, error_count, started_at, finished_at, errors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [record.exchange, record.dataset, record.status, record.recordCount, record.errorCount,
            record.startedAt, record.finishedAt, record.errors ? JSON.stringify(record.errors) : null]);
    },
    async recent(limit = 50) {
        const res = await query(`SELECT id, exchange, dataset, status, record_count as "recordCount", error_count as "errorCount",
              started_at as "startedAt", finished_at as "finishedAt", errors
       FROM market.ingestion_logs ORDER BY started_at DESC LIMIT $1`, [limit]);
        return res.rows;
    },
};
