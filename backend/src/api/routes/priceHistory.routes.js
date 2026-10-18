import {Router} from 'express';
import {z} from 'zod';
import {query} from '../../storage/db.js';
import {securitiesRepository} from '../../storage/repositories/securitiesRepository.js';
import {asyncHandler, ApiError} from '../middleware/errorHandler.js';
import {validateQuery, getQuery} from '../middleware/validateQuery.js';
import {cache} from '../../storage/cache.js';
import {publisherCloseQuery,legacyProviderCloseQuery} from '../../storage/repositories/publisherCandleQuery.js';

// Same explicitly close-only contract as the native Go candidate. No flat OHLC.
export const priceHistoryRoutes = Router();
const date = z.string().date();
const schema = z.object({exchange: z.literal('NSE').default('NSE'), from: date.optional(), to: date.optional()}).strict();
priceHistoryRoutes.get('/price-history/:symbol', validateQuery(schema), asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    if (!/^[A-Z0-9.-]{1,20}$/.test(symbol)) throw new ApiError(400, 'Invalid stock symbol');
    const input = getQuery(req), now = new Date(), to = input.to ?? now.toISOString().slice(0, 10);
    const from = input.from ?? new Date(now.getTime() - 3652 * 86400000).toISOString().slice(0, 10);
    if (from > to || to > now.toISOString().slice(0, 10) || Date.parse(to) - Date.parse(from) > 36525 * 86400000) throw new ApiError(400, 'Invalid history date range');
    const security = await securitiesRepository.getBySymbol('NSE', symbol);
    if (!security) throw new ApiError(404, 'Unknown stock symbol');
    const rows = await dailyCloseHistory(security.id, from, to);
    res.json({data: rows, basis: 'daily_close_only', ohlcAvailable: false, missingVolumeIsZero: false});
}));
export async function dailyCloseHistory(securityId, from, to) {
    return cache.getOrSet(`daily-close-v2:${securityId}:${from}:${to}`, 60000, async () => {
        const exists = await query("SELECT to_regclass('market.observed_daily_closes') IS NOT NULL AS present");
        const retained = exists.rows[0]?.present ? (await query(`SELECT c.security_id AS "securityId",to_char(c.observed_date,'YYYY-MM-DD') AS date,
            c.close,c.volume,c.adjustment,c.source_url AS "sourceUrl",c.source_id AS "sourceId",'daily_close_only' AS basis,
            NULL::numeric AS open,NULL::numeric AS high,NULL::numeric AS low
            FROM market.observed_daily_closes c JOIN scraping.sources src ON src.id=c.source_id
            WHERE c.security_id=$1 AND c.observed_date BETWEEN $2::date AND $3::date AND src.enabled AND src.redistribution_allowed=true
            AND src.config->>'closeMappingApproved'='publisher-daily-close-v1'
            AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200 ORDER BY c.observed_date,c.source_id LIMIT 10001`, [securityId, from, to])).rows : [];
        const published = await query(publisherCloseQuery, [securityId, '1d', from, to + 'T23:59:59.999Z']);
        // These two adapters historically stored closing-price observations as flat
        // OHLC. Expose only the actually observed close; MyStocks volume was a
        // placeholder, not a reported daily volume. No database rewrite is needed.
        const legacy = await query(legacyProviderCloseQuery, [securityId,from,to]);
        if (retained.length + published.rows.length + legacy.rows.length > 10000) throw new ApiError(503, 'Daily price history exceeds the bounded response limit');
        return [...retained, ...published.rows, ...legacy.rows];
    });
}
