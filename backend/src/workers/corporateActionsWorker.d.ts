/**
 * Daily sync of corporate actions, earnings events, and ownership data.
 * Same cadence reasoning as financialsWorker — these are event-driven, not
 * continuous, datasets.
 */
import { type ScheduledTask } from "node-cron";
export declare function runCorporateActionsSyncOnce(): Promise<void>;
export declare function startCorporateActionsWorker(): ScheduledTask;
