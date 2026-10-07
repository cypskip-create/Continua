/** Optional company enrichment must not hold the holdings response indefinitely.
 * Deadline is shared by all batches, not multiplied by the number of holdings.
 * Underlying read-only work may finish and warm caches after the deadline. */
export async function boundedResearch<T, R>(items: T[], load: (item: T) => Promise<R>, budgetMs = 8000, concurrency = 4): Promise<(R | null)[]> {
  const deadline = Date.now() + budgetMs;
  const results: (R | null)[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    const remaining = deadline - Date.now();
    if (remaining <= 0) { results.push(...batch.map(() => null)); continue; }
    results.push(...await Promise.all(batch.map(async item => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([Promise.resolve().then(() => load(item)).catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), remaining); })]);
      } finally { if (timer) clearTimeout(timer); }
    })));
  }
  return results;
}
