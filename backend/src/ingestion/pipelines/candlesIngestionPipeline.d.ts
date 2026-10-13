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
export declare function ingestDailyCandles(adapter: IExchangeAdapter, symbols: string[], days: number): Promise<void>;
