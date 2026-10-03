/**
 * Historical candles: a deep one-time backfill at bootstrap (so charts and
 * the research engine's momentum/volatility calcs have data to work with
 * immediately), then a shallow daily top-up so each new trading day's
 * candle gets appended without re-pulling the entire history every time.
 */
import cron, { type ScheduledTask } from "node-cron";
import { getAllAdapters } from "../adapters/registry.js";
import { securitiesRepository } from "../storage/repositories/securitiesRepository.js";
import { ingestDailyCandles } from "../ingestion/pipelines/candlesIngestionPipeline.js";
import { isTradingDay } from "../config/tradingCalendar.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

const BACKFILL_DAYS = 3_600; // deepest range supported by the NSE adapter (~10 years)
const TOPUP_DAYS = 5;        // idempotent upsert, so a small overlapping window self-heals gaps

export async function runCandlesBackfillOnce(): Promise<void> {
  for (const adapter of getAllAdapters()) {
    const securities = await securitiesRepository.listByExchange(adapter.exchange);
    if (securities.length === 0) continue;
    logger.info({ exchange: adapter.exchange, count: securities.length, days: BACKFILL_DAYS }, "Running historical candle backfill");
    await ingestDailyCandles(adapter, securities.map((s) => s.symbol), BACKFILL_DAYS);
  }
}

export async function runCandlesTopUpOnce(): Promise<void> {
  for (const adapter of getAllAdapters()) {
    // The cron schedule already restricts this to weekdays; this catches
    // the public holidays a weekday-only cron expression can't express —
    // no point re-pulling "today's" candle for a day the market never
    // opened.
    if (!env.IGNORE_TRADING_CALENDAR && !isTradingDay(adapter.exchange)) {
      logger.debug({ exchange: adapter.exchange }, "Not a trading day — skipping candle top-up");
      continue;
    }
    const securities = await securitiesRepository.listByExchange(adapter.exchange);
    if (securities.length === 0) continue;
    await ingestDailyCandles(adapter, securities.map((s) => s.symbol), TOPUP_DAYS);
  }
}

/** Runs shortly after market close on trading days. */
export function startCandlesWorker(): ScheduledTask {
  return cron.schedule("30 16 * * 1-5", () => { void runCandlesTopUpOnce(); });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCandlesBackfillOnce();
}
