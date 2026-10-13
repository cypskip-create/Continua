import { query } from "../db.js";
/** Records that failed validation or exhausted their retries — preserved
 *  for manual review instead of only appearing as a truncated string in
 *  ingestion_logs.errors. This is what "dead-letter handling" in the spec
 *  means in practice: nothing silently vanishes, even when it can't be
 *  automatically processed. */
export const deadLetterRepository = {
    async record(entry) {
        await query(`INSERT INTO market.dead_letters (exchange, dataset, symbol, payload, error, occurred_at)
       VALUES ($1,$2,$3,$4,$5, now())`, [entry.exchange, entry.dataset, entry.symbol, JSON.stringify(entry.payload), entry.error]);
    },
    async recordBatch(entries) {
        for (const entry of entries)
            await this.record(entry);
    },
    async recent(limit = 100) {
        const res = await query(`SELECT id, exchange, dataset, symbol, payload, error, occurred_at as "occurredAt"
       FROM market.dead_letters ORDER BY occurred_at DESC LIMIT $1`, [limit]);
        return res.rows;
    },
};
