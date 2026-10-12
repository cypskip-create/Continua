/**
 * Shared Postgres pool for the scraper service. Same instance as
 * continua-data and the app (one DATABASE_URL, one project) — this
 * service only ever reads/writes the `scraping` schema within it. See
 * supabase/migrations/<...> scraping engine foundation schema.sql for the
 * DDL this depends on.
 */
// Resolve pg's CommonJS export, which matches its published @types declarations.
// TypeScript emits createRequire for this import in the ESM service.
import pg = require("pg");
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

// Same numeric/bigint gotcha as continua-data — see that file's comment
// for the full explanation. Applied here too since raw_artifacts.size_bytes
// is a bigint and extractions.confidence is numeric.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => parseFloat(val));
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => parseInt(val, 10));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 12_000,
});

// Fixed: added explicit type for the error parameter
pool.on("error", (err: Error) => {
  logger.error({ err }, "Unexpected Postgres pool error");
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params as any[]);
  const ms = Date.now() - start;
  if (ms > 500) logger.warn({ text, ms }, "Slow query");
  return res;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err; // rethrow as-is; caller can handle
  } finally {
    client.release();
  }
}
