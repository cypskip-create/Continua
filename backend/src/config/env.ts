import "dotenv/config";
import { z } from "zod";

/**
 * `z.coerce.boolean()` is a footgun for env vars: it does `Boolean(value)`,
 * and `Boolean("false")` is `true` in JavaScript — any non-empty string is
 * truthy. That means `SOME_FLAG=false` in a real .env file would silently
 * be read as `true`. This helper actually parses the string instead.
 */
export function booleanEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ["true", "1", "yes"].includes(v.toLowerCase())));
}

/**
 * Every environment variable the system needs, validated once at boot.
 * If something required is missing/malformed, we fail loudly at startup
 * instead of failing weirdly three layers deep at 2am during a price tick.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  CACHE_DRIVER: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().optional(),

  NSE_CLIENT_MODE: z.enum(["mock", "live", "afx", "mystocks"]).default("mock"),
  NSE_API_BASE_URL: z.string().optional(),
  NSE_API_KEY: z.string().optional(),

  // ── AFX client (afx.kwayisi.org) ───────────────────────────────────
  // A free public source, not a licensed feed — fetched by scraping
  // individual stock pages directly (adapters/afx/afxClient.ts), NOT
  // through the scraper service's compliance pipeline (robots.txt /
  // rate limiting / licensing metadata all live inline in the client
  // itself instead, since it's a live per-request client rather than a
  // discover/fetch/parse crawl job). Deliberately polled far slower than
  // PRICE_POLL_INTERVAL_MS — that interval is sized for a real licensed
  // push/poll feed, not a public HTML page meant for human readers.
  AFX_MIN_REQUEST_INTERVAL_MS: z.coerce.number().default(1000), // 1 req/sec ceiling across all symbols
  AFX_POLL_INTERVAL_MS: z.coerce.number().default(300_000), // 5 min — see note above
  // Comma-separated tickers this client will serve, since afx.kwayisi.org
  // has no verified listing/index page to enumerate the market from (only
  // individual pages like /nse/cgen.html were ever actually inspected).
  // Left unset = falls back to the tickers already known to this codebase
  // (adapters/nse/nseClient.ts's SEED list) rather than guessing others.
  AFX_TICKERS: z.string().optional(),

  // ── Mansa API ───────────────────────────────────────────────────────
  // Pan-African market data (mansaapi.com) — the live data source behind
  // every exchange adapter in adapters/mansa/. One key covers all
  // exchanges; ADAPTER_MODE below lets a deployment run entirely on the
  // NSE mock (no key needed) until a Mansa key is actually issued.
  MANSA_API_BASE_URL: z.string().default("https://mansaapi.com"),
  MANSA_API_KEY: z.string().optional(),
  MANSA_API_IP: z.string().optional(),
  // "mock" keeps every exchange on the existing seeded NSE mock client
  // (default — works with zero setup). "live" routes every ACTIVE_EXCHANGES
  // entry through the Mansa adapter and requires MANSA_API_KEY to be set.
  ADAPTER_MODE: z.enum(["mock", "live"]).default("mock"),

  // Which adapter NSE specifically resolves to when ADAPTER_MODE=live.
  // Default "mansa" preserves existing behavior (NSE alongside every
  // other ACTIVE_EXCHANGES entry, via MansaAdapter). "nse_client" routes
  // NSE through NseAdapter instead — i.e. through createNseClient(),
  // meaning NSE_CLIENT_MODE actually takes effect in live mode. See the
  // long comment in adapters/registry.ts for why this exists.
  NSE_ADAPTER_SOURCE: z.enum(["mansa", "nse_client"]).default("mansa"),

  PRICE_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  INDEX_POLL_INTERVAL_MS: z.coerce.number().default(300_000), // 5 min — see workers/indexWorker.ts
  FINANCIALS_SYNC_CRON: z.string().default("0 2 * * *"),
  CORPORATE_ACTIONS_SYNC_CRON: z.string().default("0 3 * * *"),
  ANNOUNCEMENTS_BRIDGE_CRON: z.string().default("*/15 * * * *"), // every 15 min — scraper runs independently; this just catches up whatever it produced
  FINANCIAL_CANDIDATES_BRIDGE_CRON: z.string().default("*/15 * * * *"), // same cadence as the announcements bridge, same reasoning
  NEWS_BRIDGE_CRON: z.string().default("*/15 * * * *"), // same cadence, same reasoning

  // ── CORS ────────────────────────────────────────────────────────────
  // Comma-separated list of origins allowed to call this API from a browser
  // (e.g. "https://afrifinance.lovable.app,https://app.afrifinance.co.ke").
  // Falls back to the local Vite dev server origin so `npm run dev` keeps
  // working out of the box. Requests with no Origin header (curl, mobile
  // apps, server-to-server) are always allowed — CORS only governs browsers,
  // and this API is separately protected by API keys either way.
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "http://localhost:8080,http://127.0.0.1:8080,https://afrifinance.lovable.app")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    ),

  // ── API auth + rate limiting ──────────────────────────────────────────
  API_KEY_AUTH_ENABLED: booleanEnv(true),
  // A fixed dev key that bypasses the DB lookup entirely — lets local dev
  // and CI run against the API before any real key has been issued via
  // `npm run apikey:create`. Never set this in a production environment;
  // real callers should get a DB-issued key (revocable, rate-limited,
  // attributable) instead.
  DEV_API_KEY: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_DEFAULT: z.coerce.number().default(120),

  // ── Trading calendar ───────────────────────────────────────────────────
  // When true, workers ignore exchange trading hours/days and poll
  // continuously — useful for demos/tests run outside NSE market hours.
  IGNORE_TRADING_CALENDAR: booleanEnv(false),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();