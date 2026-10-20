import { env } from '../config/index.js';
import { runIndexIngestionOnce } from './indexWorker.js';
import { logger } from '../monitoring/logger.js';
import { cache, CacheKeys } from '../storage/cache.js';
let pending = null, lastAttempt = 0;
/** Nonblocking reader catch-up, not paid always-on hosting or keep-alive. */
export function requestIndexCollection() {
    // Actions owns bulk collection. The already deployed render-light endpoint
    // is a separate, permission-gated one-page catch-up with a durable 6h quota.
    // Disabling it here strands indices whenever the free collector sleeps.
    const collector = env.NEWS_SCRAPER_URL ?? (env.NODE_ENV === 'production' ? 'https://continua-scraper.onrender.com' : undefined);
    if (!collector || pending || Date.now() - lastAttempt < 15 * 60_000)
        return;
    lastAttempt = Date.now();
    pending = (async () => {
        const response = await fetch(new URL('/indices/refresh', collector), { method: 'POST', signal: AbortSignal.timeout(65_000) });
        if (!response.ok)
            throw new Error('Index collector unavailable');
        await response.body?.cancel();
        await runIndexIngestionOnce({ respectTradingCalendar: false });
        await cache.del(CacheKeys.indices('NSE'));
    })().catch(() => logger.warn('Reader index catch-up unavailable; retaining publisher-dated closing levels')).finally(() => { pending = null; });
}
