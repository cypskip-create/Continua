import { type ScheduledTask } from 'node-cron';
/** Validation is independent of heuristic candidate generation and live quotes.
 * The pipeline owns the single-flight/advisory locks and versioned audit. */
export declare function runDocumentPublicationOnce(): Promise<void>;
export declare function startDocumentPublicationWorker(): ScheduledTask;
