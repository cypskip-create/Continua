/**
 * Single shared Postgres pool. Continua Data writes into the `market`
 * schema of the SAME Postgres instance the app's Supabase project already
 * uses — one database, two schemas (`public` for the app, `market` for this
 * layer), so there's no cross-project sync to maintain. See
 * supabase/migrations/030_market_schema.sql for the DDL.
 */
import pg from "pg";
export declare const pool: import("pg").Pool;
export declare function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>>;
export declare function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
