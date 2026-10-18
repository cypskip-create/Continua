import {Router} from 'express';
import {asyncHandler, ApiError} from '../middleware/errorHandler.js';
import {validateQuery, getQuery} from '../middleware/validateQuery.js';
import {ExchangeQuery} from '../validators/querySchemas.js';
import {securitiesRepository} from '../../storage/repositories/securitiesRepository.js';
import {pricesRepository} from '../../storage/repositories/pricesRepository.js';
import {financialsRepository} from '../../storage/repositories/financialsRepository.js';
import {candlesRepository} from '../../storage/repositories/candlesRepository.js';
import {cache} from '../../storage/cache.js';
import {dailyCloseHistory} from './priceHistory.routes.js';
import {marketStatistics} from '../../services/marketData/marketStatistics.js';
export const statisticsRoutes = Router();
statisticsRoutes.get('/statistics/:symbol', validateQuery(ExchangeQuery), asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase(), {exchange} = getQuery(req);
    if (!/^[A-Z0-9.-]{1,20}$/.test(symbol)) throw new ApiError(400, 'Invalid stock symbol');
    const data = await cache.getOrSet(`statistics-v1:${exchange}:${symbol}`, 60000, async () => {
        const security = await securitiesRepository.getBySymbol(exchange, symbol);
        if (!security) throw new ApiError(404, 'Unknown stock symbol');
        const now = new Date(), from = new Date(now.getTime() - 366 * 86400000).toISOString().slice(0, 10), to = now.toISOString().slice(0, 10);
        const [quote, history, candles, closes] = await Promise.all([
            pricesRepository.getQuote(security.id), financialsRepository.getHistoricalPeriods(security.id, 'annual', 10),
            candlesRepository.getCandles(security.id, '1d', from, now.toISOString()),
            exchange === 'NSE' ? dailyCloseHistory(security.id, from, to) : [],
        ]);
        return marketStatistics(quote, history, candles, closes, now);
    });
    res.json({data});
}));
