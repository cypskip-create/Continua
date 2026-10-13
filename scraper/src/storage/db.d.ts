import type pgTypes = require("pg");
export declare const pool: pgTypes.Pool;
export declare function query<T extends pgTypes.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pgTypes.QueryResult<T>>;
export declare function withTransaction<T>(fn: (client: pgTypes.PoolClient) => Promise<T>): Promise<T>;
