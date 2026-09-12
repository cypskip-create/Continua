import "dotenv/config";
import { z } from "zod";

/**
 * `z.coerce.boolean()` is a footgun for env vars — see continua-data's
 * env.ts for the full explanation. Same fix here.
 */
export function booleanEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ["true", "1", "yes"].includes(v.toLowerCase())));
}

/**
 * Every environment variable this service needs, validated once at boot.
 * This is a SEPARATE service from continua-data (backend/) — it has its
 * own Render deployment and its own env vars, even though it talks to
 * the same Postgres instance.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4100),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Same Postgres instance as continua-data and the app — this service
  // only ever touches the `scraping` schema within it (see
  // supabase/migrations/<...> scraping engine foundation schema.sql).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Where raw artifacts (PDFs, HTML, images, ...) are written. Local disk
  // is fine for single-instance running, but is EPHEMERAL on most hosts'
  // free/starter web service tiers (Render included) — it's wiped on
  // every deploy and every restart. That's an accepted tradeoff for now:
  // these are re-fetchable staging artifacts, not the system of record
  // (extraction writes structured data into Postgres). RAW_STORAGE_DRIVER=
  // supabase is declared here for a future swap but NOT implemented yet
  // (see storage/rawStorage.ts) — setting it currently just makes every
  // storeRawArtifact() call throw, so leave this on "local" until that
  // driver actually exists.
  RAW_STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  RAW_STORAGE_LOCAL_PATH: z.string().default("./data/raw"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("scraper-raw"),

  // Global default politeness settings — per-source overrides live in
  // scraping.sources.config, this is just the fallback when a source
  // doesn't specify its own.
  DEFAULT_REQUESTS_PER_SECOND: z.coerce.number().default(1),
  DEFAULT_REQUEST_TIMEOUT_MS: z.coerce.number().default(30_000),
  DEFAULT_MAX_RETRIES: z.coerce.number().default(3),

  // Safety ceilings (§28) — apply regardless of source config.
  MAX_RESPONSE_SIZE_BYTES: z.coerce.number().default(50 * 1024 * 1024), // 50MB
  MAX_CRAWL_DEPTH: z.coerce.number().default(6),

  // Phase 1 — crawler identity and politeness.
  CRAWLER_USER_AGENT: z.string().default("ContinuaBot/0.1 (+https://continua.example/bot)"),
  RESPECT_ROBOTS_TXT: booleanEnv(true),

  // Phase 6 — scheduling. Per-source overrides live in
  // scraping.sources.config.schedule (a cron string); this is only the
  // fallback for sources that don't specify their own (§19: "do not
  // hardcode one global interval" — this default exists for convenience,
  // not because every source should share it).
  DEFAULT_CRAWL_CRON: z.string().default("0 */6 * * *"), // every 6 hours
  SCHEDULER_ENABLED: booleanEnv(true),

  // How often to catch up generic-crawled artifacts that were stored but
  // never extracted (extraction/extractionSweep.ts). Independent of any
  // one source's own crawl cron — this sweeps across all sources.
  EXTRACTION_SWEEP_CRON: z.string().default("*/15 * * * *"), // every 15 minutes
  EXTRACTION_SWEEP_BATCH_SIZE: z.coerce.number().default(50),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();