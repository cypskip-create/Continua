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

export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}

class InMemoryCache implements ICache {
  // Stored as `any` deliberately — this cache holds heterogeneous value
  // types (Quote, Quote[], Candle[], ratios, ...) keyed by string, and the
  // public ICache methods are what provide type safety to callers via T.
  private store = new LRUCache<string, any>({ max: 5000, ttl: 60_000 });

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set<T>(key: string, value: T, ttlMs = 60_000): Promise<void> {
    this.store.set(key, value, { ttl: ttlMs });
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
  async getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlMs);
    return value;
  }
}

/** Shares cache state across every API instance via a real Redis server —
 *  what CACHE_DRIVER=redis needs once there's more than one process serving
 *  traffic (the in-memory driver above is strictly per-process). Values are
 *  JSON-serialized; TTL is enforced by Redis itself (`PX` on SET) rather
 *  than tracked client-side. */
class RedisCache implements ICache {
  private client: Redis;

  constructor() {
    if (!env.REDIS_URL) {
      throw new Error("CACHE_DRIVER=redis requires REDIS_URL to be set.");
    }
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on("error", (err: Error) => logger.error({ err }, "Redis cache connection error"));
    this.client.on("connect", () => logger.info("Redis cache connected"));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn({ err, key }, "Failed to parse cached value — treating as a miss");
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs = 60_000): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "PX", Math.max(1, ttlMs));
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlMs);
    return value;
  }
}

function createCache(): ICache {
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
  quote: (exchange: string, symbol: string) => `quote:${exchange}:${symbol}`,
  candles: (exchange: string, symbol: string, interval: string, from: string, to: string) => `candles:${exchange}:${symbol}:${interval}:${from}:${to}`,
  ratios: (exchange: string, symbol: string) => `ratios:${exchange}:${symbol}`,
  afriScore: (exchange: string, symbol: string) => `afriscore:${exchange}:${symbol}`,
  sectors: () => "sectors:all",
  instruments: (exchange: string) => `instruments:${exchange}`,
  indices: (exchange: string) => `indices:${exchange}`,
};
