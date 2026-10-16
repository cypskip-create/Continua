import { env } from '../config/index.js';
import { runIndexIngestionOnce } from './indexWorker.js';
import { logger } from '../monitoring/logger.js';
import { cache, CacheKeys } from '../storage/cache.js';
let pending = null, lastAttempt = 0;
/** Nonblocking reader catch-up, not paid always-on hosting or keep-alive. */
export function requestIndexCollection() {
    if (env.COLLECTOR_EXECUTION_MODE === 'actions') return;
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
