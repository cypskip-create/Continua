import { pool, query } from "../db.js";
import { env } from '../../config/index.js';
export const candlesRepository = {
    /** Bulk upsert via a single multi-row statement — candle backfills can be
     *  thousands of rows and we don't want thousands of round-trips. */
    async upsertCandlesBatch(candles) {
        if (candles.length === 0)
            return;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const chunkSize = 500;
            for (let i = 0; i < candles.length; i += chunkSize) {
                const chunk = candles.slice(i, i + chunkSize);
                const values = [];
                const rows = chunk.map((c, idx) => {
                    const base = idx * 9;
                    values.push(c.securityId, c.interval, c.timestamp, c.open, c.high, c.low, c.close, c.volume, c.sourceUrl ?? null);
                    return `(${Array.from({ length: 9 }, (_, i) => `$${base + i + 1}`).join(',')})`;
                });
                await client.query(`INSERT INTO market.candles (security_id, interval, bar_time, open, high, low, close, volume,source_url)
           VALUES ${rows.join(",")}
           ON CONFLICT (security_id, interval, bar_time) DO UPDATE SET
             open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume,source_url=EXCLUDED.source_url
           WHERE EXCLUDED.source_url IS NOT NULL OR candles.source_url IS NULL`, values);
            }
            await client.query("COMMIT");
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    },
    async getCandles(securityId, interval, from, to) {
        const res = await query(`SELECT security_id as "securityId", interval, bar_time as "timestamp", open, high, low, close, volume,source_url AS "sourceUrl"
       FROM market.candles
       WHERE security_id = $1 AND interval = $2 AND bar_time BETWEEN $3 AND $4
         AND ($5 OR source_url IS NOT NULL)
       ORDER BY bar_time ASC`, [securityId, interval, from, to, env.NODE_ENV !== 'production']);
        return res.rows;
    },
    /** price-at-date / range helpers used by the research engine for returns
     *  and momentum calculations. */
    async getPriceAt(securityId, atOrBefore) {
        const res = await query(`SELECT close FROM market.candles
       WHERE security_id = $1 AND interval = '1d' AND bar_time <= $2 AND ($3 OR source_url IS NOT NULL)
       ORDER BY bar_time DESC LIMIT 1`, [securityId, atOrBefore, env.NODE_ENV !== 'production']);
        return res.rows[0]?.close ?? null;
    },
    async getHighLow(securityId, from, to) {
        const res = await query(`SELECT MAX(high) as high, MIN(low) as low FROM market.candles
       WHERE security_id = $1 AND interval = '1d' AND bar_time BETWEEN $2 AND $3 AND ($4 OR source_url IS NOT NULL)`, [securityId, from, to, env.NODE_ENV !== 'production']);
        const row = res.rows[0];
        if (!row || row.high == null)
            return null;
        return { high: Number(row.high), low: Number(row.low) };
    },
    /** Last `limit` daily closes for each of several securities in one
     *  query — the batch equivalent of getCandles(), built specifically for
     *  list-view sparklines (Watchlist, Markets, Screener, etc.) so those
     *  views don't fire one request per row. Returns real closes only; a
     *  securityId with no candle history is simply absent from the map —
     *  callers must render an honest empty state for it, never fabricate
     *  a line. Chronological order (oldest first) per security. */
    async getRecentClosesBatch(securityIds, limit = 20) {
        const result = new Map();
        if (securityIds.length === 0)
            return result;
        const res = await query(`SELECT security_id as "securityId", bar_time as "timestamp", close
       FROM (
         SELECT security_id, bar_time, close,
                row_number() OVER (PARTITION BY security_id ORDER BY bar_time DESC) as rn
         FROM market.candles
         WHERE security_id = ANY($1) AND interval = '1d' AND ($3 OR source_url IS NOT NULL)
       ) ranked
       WHERE rn <= $2
       ORDER BY security_id, bar_time ASC`, [securityIds, limit, env.NODE_ENV !== 'production']);
        for (const row of res.rows) {
            const list = result.get(row.securityId) ?? [];
            list.push({ timestamp: row.timestamp, close: Number(row.close) });
            result.set(row.securityId, list);
        }
        return result;
    },
    async getAverageVolume(securityId, from, to) {
        const res = await query(`SELECT AVG(volume) as avg_volume FROM market.candles
       WHERE security_id = $1 AND interval = '1d' AND bar_time BETWEEN $2 AND $3 AND ($4 OR source_url IS NOT NULL)`, [securityId, from, to, env.NODE_ENV !== 'production']);
        const v = res.rows[0]?.avg_volume;
        return v != null ? Number(v) : null;
    },
};
