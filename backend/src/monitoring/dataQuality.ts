/**
 * Data-quality checks that run alongside (not instead of) schema validation.
 * Schema validation asks "is this record well-formed?". These checks ask
 * "is this record plausible / fresh / complete?" — the kind of thing that
 * silently rots a chart if nobody's watching for it.
 */
import { logger } from "./logger.js";
import type { Quote } from "../types/market.js";

const STALE_QUOTE_MS = 15 * 60 * 1000; // 15 minutes with no update during market hours

export function checkQuoteFreshness(quote: Quote): { stale: boolean; ageMs: number } {
  const ageMs = Date.now() - new Date(quote.timestamp).getTime();
  const stale = ageMs > STALE_QUOTE_MS;
  if (stale) logger.warn({ symbol: quote.symbol, ageMs }, "Stale quote detected");
  return { stale, ageMs };
}

export function checkDuplicateCandle(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) {
    logger.warn({ key }, "Duplicate candle detected in batch");
    return true;
  }
  seen.add(key);
  return false;
}