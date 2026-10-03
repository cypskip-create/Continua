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
    const quote = await cache.getOrSet(CacheKeys.quote(exchange, symbol), 5_000, async () => {
      const security = await securitiesRepository.getBySymbol(exchange, symbol);
      if (!security) return null as any;
      return pricesRepository.getQuote(security.id);
    });
    return withFreshnessCheck(quote);
  },

  async getQuotesBatch(exchange: ExchangeCode, symbols: string[]): Promise<Quote[]> {
    // This is already two efficient batched queries. Do not put a second,
    // symbol-set-specific cache in front of live_quotes: there are countless
    // possible symbol combinations to invalidate after each tick, and the
    // old five-second cache made a successful refresh look delayed.
    const securities = await securitiesRepository.getBySymbols(exchange, symbols);
    const quotes = await pricesRepository.getQuotesBatch(securities.map((s) => s.id));
    quotes.forEach(checkQuoteFreshness);
    return quotes;
  },
};
