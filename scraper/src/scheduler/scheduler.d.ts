/**
 * News RSS uses NEWS_CRAWL_CRON; all other sources retain their own cron
 * expressions. A source with an
 * adapter registered in adapters/registry.ts runs via that adapter's
 * discover->fetch->parse pipeline; anything else falls back to the
 * generic crawler (crawler/crawlSource.ts).
 *
 * Node-cron, not a distributed job queue — this service runs as a single
 * instance (see rateLimiter.ts's header comment for the same tradeoff).
 * Revisit if this ever needs to run as multiple replicas.
 */
import { type ScheduledTask } from "node-cron";
/** A real financial-page read can wake the free collector. This is bounded
 * catch-up, not an always-on keepalive or arbitrary URL-fetch endpoint. */
export declare function refreshFinancialDocuments(): Promise<void>;
/** Active readers can wake a sleeping free collector, without keep-alive timers
 * or bypassing source enablement, licensing, robots or revisit throttles. */
export declare function refreshIndexSource(): Promise<void>;
/** Reader-triggered catch-up shares the cron locks and publisher throttles. */
export declare function refreshNewsSources(): Promise<void>;
export declare function newsScheduleStatus(): {
    enabled: boolean;
    cron: string;
    running: string[];
    sources: {
        startedAt: string;
        completedAt: string | null;
        success: boolean | null;
        discovered?: number;
        extracted?: number;
        sourceId: string;
    }[];
};
/**
 * Loads all enabled sources and schedules each on its own cron
 * expression. Call once at service startup. Returns the list of
 * scheduled tasks so they can be stopped (e.g. in tests or graceful
 * shutdown) — node-cron has no global "stop everything" method.
 */
export declare function startScheduler(): Promise<ScheduledTask[]>;
export declare function stopScheduler(): void;
