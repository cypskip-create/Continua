/**
 * Cache abstraction. CACHE_DRIVER=memory (default) needs zero setup and is
 * fine for a single-instance deploy. Flip to CACHE_DRIVER=redis once you're
 * running multiple API instances that need to share a hot-quote cache.
 * Callers only ever depend on ICache — swapping drivers touches this file only.
 */
import { LRUCache } from "lru-cache";
import { Redis } from "ioredis";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
import { UpstashCache } from './upstashCache.js';
class InMemoryCache {
    pending = new Map();
    // Stored as `any` deliberately — this cache holds heterogeneous value
    // types (Quote, Quote[], Candle[], ratios, ...) keyed by string, and the
    // public ICache methods are what provide type safety to callers via T.
    store = new LRUCache({ max: 5000, ttl: 60_000 });
    async get(key) {
        return this.store.get(key) ?? null;
    }
    async set(key, value, ttlMs = 60_000) {
        this.store.set(key, value, { ttl: ttlMs });
    }
    async del(key) {
        this.store.delete(key);
    }
    async getOrSet(key, ttlMs, fn) {
        const cached = await this.get(key);
        if (cached !== null)
            return cached;
        const existing = this.pending.get(key);
        if (existing)
            return existing;
        const job = Promise.resolve().then(fn).then(async (value) => {
            await this.set(key, value, ttlMs);
            return value;
        });
        this.pending.set(key, job);
        try {
            return await job;
        }
        finally {
            this.pending.delete(key);
        }
    }
}
/** Shares cache state across every API instance via a real Redis server —
 *  what CACHE_DRIVER=redis needs once there's more than one process serving
 *  traffic (the in-memory driver above is strictly per-process). Values are
 *  JSON-serialized; TTL is enforced by Redis itself (`PX` on SET) rather
 *  than tracked client-side. */
class RedisCache {
    pending = new Map();
    client;
    constructor() {
        if (!env.REDIS_URL) {
            throw new Error("CACHE_DRIVER=redis requires REDIS_URL to be set.");
        }
        this.client = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            lazyConnect: false,
            commandTimeout: 1500,
        });
        this.client.on("error", (err) => logger.error({ err }, "Redis cache connection error"));
        this.client.on("connect", () => logger.info("Redis cache connected"));
    }
    async get(key) {
        const raw = await this.client.get(key);
        if (raw == null)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch (err) {
            logger.warn({ err, key }, "Failed to parse cached value — treating as a miss");
            return null;
        }
    }
    async rateLimitCommand(parts) {
        // Do not queue unverified requests while Redis is disconnected.
        if(this.client.status!=='ready')throw new Error('Rate counter unavailable');
        return this.client.call(...parts);
    }
    async set(key, value, ttlMs = 60_000) {
        await this.client.set(key, JSON.stringify(value), "PX", Math.max(1, ttlMs));
    }
    async del(key) {
        await this.client.del(key);
    }
    async getOrSet(key, ttlMs, fn) {
        const cached = await this.get(key);
        if (cached !== null)
            return cached;
        const existing = this.pending.get(key);
        if (existing)
            return existing;
        const job = Promise.resolve().then(fn).then(async (value) => {
            await this.set(key, value, ttlMs);
            return value;
        });
        this.pending.set(key, job);
        try {
            return await job;
        }
        finally {
            this.pending.delete(key);
        }
    }
}
function createCache() {
    if (env.CACHE_DRIVER === 'upstash') {
        if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)
            throw new Error('Upstash cache requires server-side REST credentials');
        return new UpstashCache(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, env.CACHE_NAMESPACE, new InMemoryCache());
    }
    if (env.CACHE_DRIVER === "redis") {
        logger.info("Using Redis cache driver");
        return new RedisCache();
    }
    logger.info("Using in-memory cache driver");
    return new InMemoryCache();
}
export const cache = createCache();
/** Cache key conventions — keep these consistent so invalidation stays sane. */
export const CacheKeys = {
    quote: (exchange, symbol) => `quote:${exchange}:${symbol}`,
    candles: (exchange, symbol, interval, from, to) => `candles:${exchange}:${symbol}:${interval}:${from}:${to}`,
    ratios: (exchange, symbol) => `ratios:${exchange}:${symbol}`,
    afriScore: (exchange, symbol) => `afriscore:${exchange}:${symbol}`,
    sectors: () => "sectors:all",
    instruments: (exchange) => `instruments:${exchange}`,
    indices: (exchange) => `indices:${exchange}`,
};
