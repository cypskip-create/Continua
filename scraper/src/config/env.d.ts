import "dotenv/config";
import { z } from "zod";
/**
 * `z.coerce.boolean()` is a footgun for env vars — see continua-data's
 * env.ts for the full explanation. Same fix here.
 */
export declare function booleanEnv(defaultValue: boolean): z.ZodEffects<z.ZodOptional<z.ZodString>, boolean, string | undefined>;
/**
 * Every environment variable this service needs, validated once at boot.
 * This is a SEPARATE service from continua-data (backend/) — it has its
 * own Render deployment and its own env vars, even though it talks to
 * the same Postgres instance.
 */
declare const EnvSchema: z.ZodObject<{
    PDF_NATIVE_ENGINE: z.ZodDefault<z.ZodEnum<["poppler", "python"]>>;
    PYTHON_BIN: z.ZodDefault<z.ZodString>;
    SCRAPER_ADMIN_API_KEY: z.ZodOptional<z.ZodString>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    PORT: z.ZodDefault<z.ZodNumber>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
    DATABASE_URL: z.ZodString;
    RAW_STORAGE_DRIVER: z.ZodDefault<z.ZodEnum<["local", "supabase", "r2"]>>;
    R2_ACCOUNT_ID: z.ZodOptional<z.ZodString>;
    R2_ACCESS_KEY_ID: z.ZodOptional<z.ZodString>;
    R2_SECRET_ACCESS_KEY: z.ZodOptional<z.ZodString>;
    R2_BUCKET: z.ZodOptional<z.ZodString>;
    R2_DUAL_WRITE: z.ZodEffects<z.ZodOptional<z.ZodString>, boolean, string | undefined>;
    RAW_STORAGE_LOCAL_PATH: z.ZodDefault<z.ZodString>;
    SUPABASE_URL: z.ZodOptional<z.ZodString>;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodOptional<z.ZodString>;
    SUPABASE_STORAGE_BUCKET: z.ZodDefault<z.ZodString>;
    DEFAULT_REQUESTS_PER_SECOND: z.ZodDefault<z.ZodNumber>;
    DEFAULT_REQUEST_TIMEOUT_MS: z.ZodDefault<z.ZodNumber>;
    DEFAULT_MAX_RETRIES: z.ZodDefault<z.ZodNumber>;
    MAX_RESPONSE_SIZE_BYTES: z.ZodDefault<z.ZodNumber>;
    MAX_CRAWL_DEPTH: z.ZodDefault<z.ZodNumber>;
    CRAWLER_USER_AGENT: z.ZodDefault<z.ZodString>;
    RESPECT_ROBOTS_TXT: z.ZodEffects<z.ZodOptional<z.ZodString>, boolean, string | undefined>;
    DEFAULT_CRAWL_CRON: z.ZodDefault<z.ZodString>;
    NEWS_CRAWL_CRON: z.ZodDefault<z.ZodString>;
    SCHEDULER_ENABLED: z.ZodEffects<z.ZodOptional<z.ZodString>, boolean, string | undefined>;
    DOCUMENT_DRAIN_CRON: z.ZodDefault<z.ZodString>;
    DOCUMENT_DRAIN_BATCH_SIZE: z.ZodDefault<z.ZodNumber>;
    EXTRACTION_SWEEP_CRON: z.ZodDefault<z.ZodString>;
    EXTRACTION_SWEEP_BATCH_SIZE: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    PDF_NATIVE_ENGINE: "poppler" | "python";
    PYTHON_BIN: string;
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
    DATABASE_URL: string;
    RAW_STORAGE_DRIVER: "local" | "supabase" | "r2";
    R2_DUAL_WRITE: boolean;
    RAW_STORAGE_LOCAL_PATH: string;
    SUPABASE_STORAGE_BUCKET: string;
    DEFAULT_REQUESTS_PER_SECOND: number;
    DEFAULT_REQUEST_TIMEOUT_MS: number;
    DEFAULT_MAX_RETRIES: number;
    MAX_RESPONSE_SIZE_BYTES: number;
    MAX_CRAWL_DEPTH: number;
    CRAWLER_USER_AGENT: string;
    RESPECT_ROBOTS_TXT: boolean;
    DEFAULT_CRAWL_CRON: string;
    NEWS_CRAWL_CRON: string;
    SCHEDULER_ENABLED: boolean;
    DOCUMENT_DRAIN_CRON: string;
    DOCUMENT_DRAIN_BATCH_SIZE: number;
    EXTRACTION_SWEEP_CRON: string;
    EXTRACTION_SWEEP_BATCH_SIZE: number;
    SCRAPER_ADMIN_API_KEY?: string | undefined;
    R2_ACCOUNT_ID?: string | undefined;
    R2_ACCESS_KEY_ID?: string | undefined;
    R2_SECRET_ACCESS_KEY?: string | undefined;
    R2_BUCKET?: string | undefined;
    SUPABASE_URL?: string | undefined;
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
}, {
    DATABASE_URL: string;
    PDF_NATIVE_ENGINE?: "poppler" | "python" | undefined;
    PYTHON_BIN?: string | undefined;
    SCRAPER_ADMIN_API_KEY?: string | undefined;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    PORT?: number | undefined;
    LOG_LEVEL?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | undefined;
    RAW_STORAGE_DRIVER?: "local" | "supabase" | "r2" | undefined;
    R2_ACCOUNT_ID?: string | undefined;
    R2_ACCESS_KEY_ID?: string | undefined;
    R2_SECRET_ACCESS_KEY?: string | undefined;
    R2_BUCKET?: string | undefined;
    R2_DUAL_WRITE?: string | undefined;
    RAW_STORAGE_LOCAL_PATH?: string | undefined;
    SUPABASE_URL?: string | undefined;
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
    SUPABASE_STORAGE_BUCKET?: string | undefined;
    DEFAULT_REQUESTS_PER_SECOND?: number | undefined;
    DEFAULT_REQUEST_TIMEOUT_MS?: number | undefined;
    DEFAULT_MAX_RETRIES?: number | undefined;
    MAX_RESPONSE_SIZE_BYTES?: number | undefined;
    MAX_CRAWL_DEPTH?: number | undefined;
    CRAWLER_USER_AGENT?: string | undefined;
    RESPECT_ROBOTS_TXT?: string | undefined;
    DEFAULT_CRAWL_CRON?: string | undefined;
    NEWS_CRAWL_CRON?: string | undefined;
    SCHEDULER_ENABLED?: string | undefined;
    DOCUMENT_DRAIN_CRON?: string | undefined;
    DOCUMENT_DRAIN_BATCH_SIZE?: number | undefined;
    EXTRACTION_SWEEP_CRON?: string | undefined;
    EXTRACTION_SWEEP_BATCH_SIZE?: number | undefined;
}>;
export type Env = z.infer<typeof EnvSchema>;
export declare const env: {
    PDF_NATIVE_ENGINE: "poppler" | "python";
    PYTHON_BIN: string;
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
    DATABASE_URL: string;
    RAW_STORAGE_DRIVER: "local" | "supabase" | "r2";
    R2_DUAL_WRITE: boolean;
    RAW_STORAGE_LOCAL_PATH: string;
    SUPABASE_STORAGE_BUCKET: string;
    DEFAULT_REQUESTS_PER_SECOND: number;
    DEFAULT_REQUEST_TIMEOUT_MS: number;
    DEFAULT_MAX_RETRIES: number;
    MAX_RESPONSE_SIZE_BYTES: number;
    MAX_CRAWL_DEPTH: number;
    CRAWLER_USER_AGENT: string;
    RESPECT_ROBOTS_TXT: boolean;
    DEFAULT_CRAWL_CRON: string;
    NEWS_CRAWL_CRON: string;
    SCHEDULER_ENABLED: boolean;
    DOCUMENT_DRAIN_CRON: string;
    DOCUMENT_DRAIN_BATCH_SIZE: number;
    EXTRACTION_SWEEP_CRON: string;
    EXTRACTION_SWEEP_BATCH_SIZE: number;
    SCRAPER_ADMIN_API_KEY?: string | undefined;
    R2_ACCOUNT_ID?: string | undefined;
    R2_ACCESS_KEY_ID?: string | undefined;
    R2_SECRET_ACCESS_KEY?: string | undefined;
    R2_BUCKET?: string | undefined;
    SUPABASE_URL?: string | undefined;
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
};
export {};
