import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { aggregateCandles } from "../analytics/candleAggregator.js";
export const historicalService = {
    async getCandles(exchange, symbol, interval, from, to) {
        return cache.getOrSet(CacheKeys.candles(exchange, symbol, interval, from, to), 30_000, async () => {
            const security = await securitiesRepository.getBySymbol(exchange, symbol);
            if (!security)
                return [];
            // Reconstruct coarse bars from the daily source of truth. Older deployments
            // stored Thursday-aligned weeks and partial top-up months/years; never mix
            // those legacy rows with corrected bars or require a destructive cleanup.
            if (interval === "1w" || interval === "1M" || interval === "1y") {
                const daily = await candlesRepository.getCandles(security.id, "1d", from, to);
                const start = new Date(from).getTime();
                return aggregateCandles(daily, interval).filter((bar) => new Date(bar.timestamp).getTime() >= start);
            }
            return candlesRepository.getCandles(security.id, interval, from, to);
        });
    },
    async getRangePerformance(exchange, symbol, from, to) {
        const security = await securitiesRepository.getBySymbol(exchange, symbol);
        if (!security)
            return null;
        const startPrice = await candlesRepository.getPriceAt(security.id, from);
        const endPrice = await candlesRepository.getPriceAt(security.id, to);
        if (startPrice == null || endPrice == null || startPrice === 0)
            return null;
        return { startPrice, endPrice, changePercent: ((endPrice - startPrice) / startPrice) * 100 };
    },
    async getHighLow(exchange, symbol, from, to) {
        const security = await securitiesRepository.getBySymbol(exchange, symbol);
        if (!security)
            return null;
        return candlesRepository.getHighLow(security.id, from, to);
    },
    /** Batch, symbol-keyed recent-closes for list-view sparklines. A symbol
     *  with no candle history yet (not backfilled, or outside the tracked
     *  universe) is simply absent from the result — the frontend must
     *  render that as an honest empty state, not a fabricated line. */
    async getSparklines(exchange, symbols, points = 20) {
        const securities = await securitiesRepository.getBySymbols(exchange, symbols);
        if (securities.length === 0)
            return {};
        const closesById = await candlesRepository.getRecentClosesBatch(securities.map((s) => s.id), points);
        const bySymbol = {};
        for (const security of securities) {
            const closes = closesById.get(security.id);
            if (closes && closes.length > 0)
                bySymbol[security.symbol] = closes.map((c) => c.close);
        }
        return bySymbol;
    },
};
