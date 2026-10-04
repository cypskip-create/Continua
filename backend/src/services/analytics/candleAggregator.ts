/**
 * Rolls lower-timeframe candles up into higher timeframes (e.g. 1m → 1h,
 * 1d → 1w/1M/1y). Used by the historical pipeline so we don't have to fetch
 * every timeframe independently from the adapter — one fine-grained pull,
 * many derived resolutions.
 */
import type { Candle, CandleInterval } from "../../types/market.js";

// Intraday/daily intervals bucket cleanly by dividing epoch-ms. Weeks need
// Monday alignment, while months and years are NOT fixed-length
// (28-31 days; 365-366 days), so bucketing them the same way is wrong: a
// naive `Math.floor(t / (30 * 86400000))` puts Jan 30 and Feb 2 in the same
// "30-day" bucket depending on epoch alignment, silently merging two
// different calendar months. Those two intervals are bucketed by actual
// calendar month/year instead — see bucketKeyFor below.
const FIXED_BUCKET_MS: Partial<Record<CandleInterval, number>> = {
  "1m": 60_000, "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 3_600_000,
  "1d": 86_400_000,
};

/** Returns a bucket key (not necessarily a timestamp) that groups candles
 *  correctly for the target interval, plus the ISO timestamp that should
 *  represent that bucket's start. */
function bucketFor(date: Date, targetInterval: CandleInterval): { key: string; startIso: string } {
  if (targetInterval === "1w") {
    // Exchange weeks begin Monday, not Thursday (Unix epoch alignment).
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return { key: monday.toISOString(), startIso: monday.toISOString() };
  }
  const fixedMs = FIXED_BUCKET_MS[targetInterval];
  if (fixedMs) {
    const bucketStartMs = Math.floor(date.getTime() / fixedMs) * fixedMs;
    return { key: String(bucketStartMs), startIso: new Date(bucketStartMs).toISOString() };
  }
  if (targetInterval === "1M") {
    const y = date.getUTCFullYear(), m = date.getUTCMonth();
    return { key: `${y}-${m}`, startIso: new Date(Date.UTC(y, m, 1)).toISOString() };
  }
  // "1y"
  const y = date.getUTCFullYear();
  return { key: String(y), startIso: new Date(Date.UTC(y, 0, 1)).toISOString() };
}

export function aggregateCandles(source: Candle[], targetInterval: CandleInterval): Candle[] {
  if (source.length === 0) return [];
  const sorted = [...source].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const buckets = new Map<string, { startIso: string; candles: Candle[] }>();
  for (const candle of sorted) {
    const { key, startIso } = bucketFor(new Date(candle.timestamp), targetInterval);
    const bucket = buckets.get(key) ?? { startIso, candles: [] };
    bucket.candles.push(candle);
    buckets.set(key, bucket);
  }

  const result: Candle[] = Array.from(buckets.values())
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
    .map(({ startIso, candles }) => ({
      securityId: candles[0]!.securityId,
      interval: targetInterval,
      timestamp: startIso,
      open: candles[0]!.open,
      close: candles[candles.length - 1]!.close,
      high: Math.max(...candles.map((c) => c.high)),
      low: Math.min(...candles.map((c) => c.low)),
      volume: candles.reduce((sum, c) => sum + Number(c.volume), 0),
    }));
  return result;
}
