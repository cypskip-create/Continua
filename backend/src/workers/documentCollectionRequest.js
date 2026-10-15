import { env } from '../config/index.js';
import { logger } from '../monitoring/logger.js';
let active = null, last = 0;
export function requestDocumentCollection() {
    if (env.COLLECTOR_EXECUTION_MODE === 'actions') return;
    const collector = env.NEWS_SCRAPER_URL ?? (env.NODE_ENV === 'production' ? 'https://continua-scraper.onrender.com' : undefined);
    if (!collector || active || Date.now() - last < 10 * 60_000)
        return;
    last = Date.now();
    active = (async () => {
        const response = await fetch(new URL('/documents/refresh', collector), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(65000) });
        if (!response.ok)
            throw new Error('Document collector unavailable');
        await response.body?.cancel();
    })().catch(() => logger.warn('Document catch-up request unavailable; existing financial data retained')).finally(() => { active = null; });
}
