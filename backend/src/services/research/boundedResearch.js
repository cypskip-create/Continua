/** Optional company enrichment must not hold the holdings response indefinitely.
 * Deadline is shared by all batches, not multiplied by the number of holdings.
 * Underlying read-only work may finish and warm caches after the deadline. */
export async function boundedResearch(items, load, budgetMs = 8000, concurrency = 4) {
    const deadline = Date.now() + budgetMs;
    const results = [];
    for (let index = 0; index < items.length; index += concurrency) {
        const batch = items.slice(index, index + concurrency);
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            results.push(...batch.map(() => null));
            continue;
        }
        results.push(...await Promise.all(batch.map(async (item) => {
            let timer;
            try {
                return await Promise.race([Promise.resolve().then(() => load(item)).catch(() => null), new Promise(resolve => { timer = setTimeout(() => resolve(null), remaining); })]);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        })));
    }
    return results;
}
