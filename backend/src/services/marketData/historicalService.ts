import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import type { Candle, CandleInterval } from "../../types/market.js";
import type { ExchangeCode } from "../../config/index.js";

export const historicalService = {
  async getCandles(exchange: ExchangeCode, symbol: string, interval: CandleInterval, from: string, to: string): Promise<Candle[]> {
    return cache.getOrSet(CacheKeys.candles(symbol, interval, from, to), 30_000, async () => {
      const security = await securitiesRepository.getBySymbol(exchange, symbol);
      if (!security) return [];
      return candlesRepository.getCandles(security.id, interval, from, to);
    });
  },

  async getRangePerformance(exchange: ExchangeCode, symbol: string, from: string, to: string): Promise<{ startPrice: number; endPrice: number; changePercent: number } | null> {
    const security = await securitiesRepository.getBySymbol(exchange, symbol);
    if (!security) return null;
    const startPrice = await candlesRepository.getPriceAt(security.id, from);
    const endPrice = await candlesRepository.getPriceAt(security.id, to);
    if (startPrice == null || endPrice == null || startPrice === 0) return null;
    return { startPrice, endPrice, changePercent: ((endPrice - startPrice) / startPrice) * 100 };
  },

  async getHighLow(exchange: ExchangeCode, symbol: string, from: string, to: string) {
    const security = await securitiesRepository.getBySymbol(exchange, symbol);
    if (!security) return null;
    return candlesRepository.getHighLow(security.id, from, to);
  },

  /** Batch, symbol-keyed recent-closes for list-view sparklines. A symbol
   *  with no candle history yet (not backfilled, or outside the tracked
   *  universe) is simply absent from the result — the frontend must
   *  render that as an honest empty state, not a fabricated line. */
  async getSparklines(exchange: ExchangeCode, symbols: string[], points = 20): Promise<Record<string, number[]>> {
    const securities = await securitiesRepository.getBySymbols(exchange, symbols);
    if (securities.length === 0) return {};
    const closesById = await candlesRepository.getRecentClosesBatch(securities.map((s) => s.id), points);
    const bySymbol: Record<string, number[]> = {};
    for (const security of securities) {
      const closes = closesById.get(security.id);
      if (closes && closes.length > 0) bySymbol[security.symbol] = closes.map((c) => c.close);
    }
    return bySymbol;
  },
};