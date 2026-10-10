/**
 * Verified Engine users each get an independent bucket. Market-data reads
 * use per-API-key and client-IP limits so visitors cannot exhaust one shared website bucket.
 * Hosts must configure the trusted proxy count.
 * Each key's own `rate_limit_per_min` (set at key-creation time) is used
 * when available, so a higher-tier customer can be issued a higher limit
 * without a code change — just a different value in `market.api_keys`.
 */
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../../config/index.js";

export function apiRateLimit() {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: (req: Request) => req.apiKey?.rateLimitPerMin ?? env.RATE_LIMIT_MAX_DEFAULT,
    // express-rate-limit requires IPv6 addresses to go through its own
    // normalizer (ipKeyGenerator) rather than being used as a raw string
    // key — otherwise distinct-but-equivalent IPv6 representations of the
    // same client could bypass the limit. API-key-based limiting (the
    // normal case) bypasses this entirely.
    keyGenerator: (req: Request, res) => {
      if (res.locals.engineIdentityVerified === true) return `engine:${req.apiKey?.id ?? "authenticated"}:${res.locals.engineUserId}`;
      // The website uses a first-party public key. A key-only bucket made
      // unrelated visitors throttle each other and broke periodic Markets reads.
      return `${req.apiKey?.id ?? "public"}:${ipKeyGenerator(req.ip ?? "unknown")}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Rate limit exceeded — slow down." },
  });
}
