import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { checkQuoteFreshness } from "../../monitoring/dataQuality.js";
import type { Quote } from "../../types/market.js";
import type { ExchangeCode } from "../../config/index.js";

/** Runs the freshness check on every quote actually handed to a caller —
 *  including cache hits, since staleness is about wall-clock distance from
 *  the quote's own event_timestamp, not about when it entered the cache.
 *  This is what would surface a stalled price worker: quotes keep getting
 *  served, but checkQuoteFreshness starts logging warnings for all of them. */
function withFreshnessCheck(quote: Quote | null): Quote | null {
  if (quote) checkQuoteFreshness(quote);
  return quote;
}

export const quoteService = {
  async getQuote(exchange: ExchangeCode, symbol: string): Promise<Quote | null> {
    const quote = await cache.getOrSet(CacheKeys.quote(symbol), 5_000, async () => {
      const security = await securitiesRepository.getBySymbol(exchange, symbol);
      if (!security) return null as any;
      return pricesRepository.getQuote(security.id);
    });
    return withFreshnessCheck(quote);
  },

  async getQuotesBatch(exchange: ExchangeCode, symbols: string[]): Promise<Quote[]> {
    const quotes = await cache.getOrSet(CacheKeys.quotesBatch(symbols), 5_000, async () => {
      // One batched lookup instead of one query per symbol (see
      // securitiesRepository.getBySymbols's own doc comment — it exists
      // for exactly this). The old Promise.all(symbols.map(getBySymbol))
      // turned every quote batch into N individual DB round-trips, and
      // with several widgets each firing their own quotes request on a
      // single page load, that added up to dozens of concurrent queries
      // competing for a small free-tier connection pool.
      const securities = await securitiesRepository.getBySymbols(exchange, symbols);
      const ids = securities.map((s) => s.id);
      return pricesRepository.getQuotesBatch(ids);
    });
    quotes.forEach(checkQuoteFreshness);
    return quotes;
  },
};