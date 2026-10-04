export interface RefreshTask { label: string; run: () => Promise<unknown> }
/** Attempt every section independently; one unavailable optional dataset must
 * not prevent successful prices, news and holdings from being refreshed. */
export async function runRefreshTasks(tasks: RefreshTask[], timeoutMs = 15_000) {
  return Promise.all(tasks.map(async ({ label, run }) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.resolve().then(run), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
      })]);
      return { label, status: 'updated' as const };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      return { label, status: status === 404 ? 'unavailable' as const : 'failed' as const, error };
    } finally { clearTimeout(timer); }
  }));
}
