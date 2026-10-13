import type { ICache } from './cache.js';
export declare class UpstashCache implements ICache {
    private url;
    private token;
    private namespace;
    private fallback;
    private pending;
    readonly metrics: {
        hits: number;
        misses: number;
        failures: number;
    };
    constructor(url: string, token: string, namespace: string, fallback: ICache);
    private command;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
    del(key: string): Promise<void>;
    getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
