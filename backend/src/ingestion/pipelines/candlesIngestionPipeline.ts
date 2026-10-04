/**
 * Historical candle pipeline. Pulls daily OHLCV from the adapter, stores it,
 * then derives weekly/monthly/yearly candles from the daily series via the
 * aggregator rather than fetching each resolution separately — one fetch,
 * many stored resolutions. Backfills a long window once (bootstrap) and
 * tops up a short trailing window on a daily cron (idempotent upsert, so
 * re-fetching the last few days is cheap and self-healing if a prior run
 * partially failed).
 */
import type { IExchangeAdapter } from "../../adapters/types.js";
import { validateBatch } from "../validators/validate.js";
import { CandleSchema } from "../validators/schemas.js";
import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { aggregateCandles } from "../../services/analytics/candleAggregator.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { checkDuplicateCandle } from "../../monitoring/dataQuality.js";
import { withRetry } from "../retry.js";
import { logger } from "../../monitoring/logger.js";
import type { Candle } from "../../types/market.js";

export async function ingestDailyCandles(adapter: IExchangeAdapter, symbols: string[], days: number): Promise<void> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let stored = 0;
  let duplicatesDropped = 0;

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  for (const symbol of symbols) {
    try {
      const raw = await withRetry(
        () => adapter.getCandles(symbol, "1d", from.toISOString(), to.toISOString()),
        { label: `${adapter.exchange}.getCandles(${symbol})` }
      );
      const { valid: validShapes, rejected } = validateBatch(CandleSchema, raw);
      rejected.forEach((r) => errors.push(`${symbol}: candle rejected: ${JSON.stringify(r.issues)}`));

      // A well-behaved feed shouldn't send the same bar twice in one
      // response, but a paginated/retried provider call sometimes does —
      // drop repeats before they hit an upsert (which would silently mask
      // it) so it's visible in the ingestion log instead.
      const seen = new Set<string>();
      const daily = validShapes.filter((c) => {
        if (checkDuplicateCandle(seen, `${c.securityId}:${c.interval}:${c.timestamp}`)) {
          duplicatesDropped++;
          return false;
        }
        return true;
      });

      if (daily.length === 0) continue;
      await candlesRepository.upsertCandlesBatch(daily);
      stored += daily.length;

      // Never replace an entire month/year with a five-day top-up. Rebuild
      // touched buckets from stored daily history, including cross-year weeks.
      const earliest = Math.min(...daily.map((c) => new Date(c.timestamp).getTime()));
      const yearStart = Date.UTC(new Date(earliest).getUTCFullYear(), 0, 1);
      const history = await candlesRepository.getCandles(
        daily[0]!.securityId, "1d", new Date(yearStart - 7 * 86_400_000).toISOString(), to.toISOString(),
      );
      const touched = (interval: "1w" | "1M" | "1y") => {
        const keys = new Set(aggregateCandles(daily, interval).map((c) => c.timestamp));
        return aggregateCandles(history, interval).filter((c) => keys.has(c.timestamp));
      };
      const derived: Candle[] = [
        ...touched("1w"), ...touched("1M"), ...touched("1y"),
      ];
      if (derived.length) {
        await candlesRepository.upsertCandlesBatch(derived);
        stored += derived.length;
      }
    } catch (err) {
      errors.push(`${symbol}: ${String(err)}`);
      await deadLetterRepository.record({
        exchange: adapter.exchange, dataset: "candle", symbol,
        payload: { symbol, days }, error: String(err),
      });
    }
  }

  await ingestionLogRepository.log({
    exchange: adapter.exchange, dataset: "candle",
    status: errors.length === 0 ? "success" : (stored > 0 ? "partial" : "failed"),
    recordCount: stored, errorCount: errors.length,
    startedAt, finishedAt: new Date().toISOString(),
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });

  if (duplicatesDropped) logger.warn({ exchange: adapter.exchange, duplicatesDropped }, "Candle ingestion dropped duplicate bars");
  if (errors.length) logger.warn({ exchange: adapter.exchange, errorCount: errors.length }, "Candle ingestion completed with errors");
}
