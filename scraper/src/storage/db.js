/**
 * Shared Postgres pool for the scraper service. Same instance as
 * continua-data and the app (one DATABASE_URL, one project) — this
 * service only ever reads/writes the `scraping` schema within it. See
 * supabase/migrations/<...> scraping engine foundation schema.sql for the
 * DDL this depends on.
 */
// Resolve pg's CommonJS export, which matches its published @types declarations.
// TypeScript emits createRequire for this import in the ESM service.
import { createRequire } from "node:module";
const pg = createRequire(import.meta.url)("pg");
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
// Same numeric/bigint gotcha as continua-data — see that file's comment
// for the full explanation. Applied here too since raw_artifacts.size_bytes
// is a bigint and extractions.confidence is numeric.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val) => parseFloat(val));
pg.types.setTypeParser(pg.types.builtins.INT8, (val) => parseInt(val, 10));
export const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 12_000,
});
// Fixed: added explicit type for the error parameter
pool.on("error", (err) => {
    logger.error({ err }, "Unexpected Postgres pool error");
});
// Leased clients can disconnect between statements as well as while idle in
// the pool. Observe that event without retrying an ambiguous evidence write.
pool.on('connect',client=>client.on('error',()=>logger.error({component:'collector-database'},'Database connection interrupted')));
export async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const ms = Date.now() - start;
    if (ms > 500)
        logger.warn({ text, ms }, "Slow query");
    return res;
}
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err; // rethrow as-is; caller can handle
    }
    finally {
        client.release();
    }
}
