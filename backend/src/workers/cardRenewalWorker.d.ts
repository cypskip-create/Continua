/** Provider requests happen after a durable reservation, and are never retried
 * after ambiguous failure. Subsequent ticks only verify the existing reference. */
export declare function runCardRenewals(): Promise<void>;
export declare function startCardRenewalWorker(): import("node-cron").ScheduledTask;
