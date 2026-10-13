/**
 * Periodically pulls whatever continua-scraper's RSS adapter has produced
 * into market.news_items. Same pattern as announcementsWorker.ts /
 * financialStatementCandidatesWorker.ts, including the reasoning for why
 * a one-off run uses a dedicated always-runs script instead of
 * self-detection.
 *
 * For a one-off manual run, use scripts/runNewsBridgeOnce.ts.
 */
import { type ScheduledTask } from "node-cron";
/** Only active readers trigger this; it is not a keep-alive timer. Never hold
 * the HTTP news response open for a sleeping collector or publisher crawl. */
export declare function requestNewsCollection(): void;
export declare function runNewsBridgeOnce(): Promise<void>;
export declare function startNewsWorker(): ScheduledTask;
