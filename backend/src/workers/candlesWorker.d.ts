/**
 * Historical candles: a deep one-time backfill at bootstrap (so charts and
 * the research engine's momentum/volatility calcs have data to work with
 * immediately), then a shallow daily top-up so each new trading day's
 * candle gets appended without re-pulling the entire history every time.
 */
import { type ScheduledTask } from "node-cron";
export declare function runCandlesBackfillOnce(): Promise<void>;
export declare function runCandlesTopUpOnce(): Promise<void>;
/** Runs shortly after market close on trading days. */
export declare function startCandlesWorker(): ScheduledTask;
