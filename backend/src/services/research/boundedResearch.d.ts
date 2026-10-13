/** Optional company enrichment must not hold the holdings response indefinitely.
 * Deadline is shared by all batches, not multiplied by the number of holdings.
 * Underlying read-only work may finish and warm caches after the deadline. */
export declare function boundedResearch<T, R>(items: T[], load: (item: T) => Promise<R>, budgetMs?: number, concurrency?: number): Promise<(R | null)[]>;
