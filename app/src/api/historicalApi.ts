import { continuaFetch } from "./client";
import type { Candle, CandleInterval, RangePerformance } from "./types";

export const historicalApi = {
  getCandles(
    symbol: string,
    opts: { interval?: CandleInterval; from?: string; to?: string; exchange?: string } = {}
  ) {
    const { interval = "1d", from, to, exchange = "NSE" } = opts;
    return continuaFetch<Candle[]>(`/historical/${encodeURIComponent(symbol)}`, {
      params: { exchange, interval, from, to },
    });
  },

  getPerformance(symbol: string, from: string, opts: { to?: string; exchange?: string } = {}) {
    const { to, exchange = "NSE" } = opts;
    return continuaFetch<RangePerformance>(`/historical/${encodeURIComponent(symbol)}/performance`, {
      params: { exchange, from, to },
    });
  },

  /** Batch recent closes for list-view sparklines — one request for every
   *  symbol on a page. Symbols with no candle history yet are simply
   *  absent from the response; callers must render that as an honest
   *  empty state, never a fabricated line. */
  getSparklines(symbols: string[], opts: { points?: number; exchange?: string } = {}) {
    const { points, exchange = "NSE" } = opts;
    return continuaFetch<Record<string, number[]>>("/historical/sparklines", {
      params: { exchange, symbols: symbols.join(","), points },
    });
  },
};