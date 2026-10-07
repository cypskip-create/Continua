/**
 * Single shared Postgres pool. Continua Data writes into the `market`
 * schema of the SAME Postgres instance the app's Supabase project already
 * uses — one database, two schemas (`public` for the app, `market` for this
 * layer), so there's no cross-project sync to maintain. See
 * supabase/migrations/030_market_schema.sql for the DDL.
 */
import pg from "pg";
import { registerDateTypes } from "./dateTypes.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

// node-postgres returns NUMERIC and BIGINT columns as STRINGS by default —
// a well-known pg gotcha, because a numeric/bigint value can exceed what a
// JS number can represent exactly. Every price, ratio, market cap, and
// volume in this schema is a `numeric` or `bigint` column, so left as the
// default, EVERY repository read would silently hand callers strings
// instead of numbers: `"1"+"2"` concatenates to `"12"` instead of adding to
// `3`, comparisons like `pe < 100` behave unpredictably, etc.
//
// The values in this domain (prices, market caps in KES, share counts,
// ratios, ingestion log ids) never approach Number.MAX_SAFE_INTEGER
// (2^53), so parsing them as floats/ints here is safe and correct for
// Continua Data specifically — this would need reconsidering only if a
// numeric column were ever used to hold something like a cryptographic
// value or an ID space larger than 2^53.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => parseFloat(val));
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => parseInt(val, 10));
registerDateTypes();

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 12_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected Postgres pool error");
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params as any[]);
  const ms = Date.now() - start;
  if (ms > 500) logger.warn({ text, ms }, "Slow query");
  return res;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
