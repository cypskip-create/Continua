export interface ICache {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
    del(key: string): Promise<void>;
    getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
export declare const cache: ICache;
/** Cache key conventions — keep these consistent so invalidation stays sane. */
export declare const CacheKeys: {
    quote: (exchange: string, symbol: string) => string;
    candles: (exchange: string, symbol: string, interval: string, from: string, to: string) => string;
    ratios: (exchange: string, symbol: string) => string;
    afriScore: (exchange: string, symbol: string) => string;
    sectors: () => string;
    instruments: (exchange: string) => string;
    indices: (exchange: string) => string;
};
