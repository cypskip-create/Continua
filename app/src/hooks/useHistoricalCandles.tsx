import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { historicalApi } from "@/api/historicalApi";
import type { Candle } from "@/api/types";

export interface ChartPoint {
  date: string;
  price: number;
  open: number;
  close: number;
  high: number;
  low: number;
  body: [number, number];
  wickRange: [number, number];
  up: boolean;
  timestamp: number;
  volume: number;
}

/** How far back to ask the Data Layer for, per UI timeframe pill.
 *
 *  NOTE: the backend currently only backfills DAILY ("1d") candles
 *  (backend/src/workers/candlesWorker.ts — 400-day backfill, no intraday
 *  candle ingestion yet). That's fine for 1W and up, but a "1D" chart made
 *  of daily bars would just be 1-2 points, not an intraday line. So "1D"
 *  intentionally isn't fetched here — StockDetail.tsx keeps its existing
 *  generated series for that one timeframe until the Data Layer has an
 *  intraday candle source to back it with real data.
 */
const TIMEFRAME_DAYS: Record<string, number | undefined> = {
  "1D": undefined, // not backed by real data yet — see note above
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "YTD": undefined, // computed specially, see below
  "1Y": 365,
  "ALL": 1_825, // matches the backend's five-year backfill window
};

function formatDateLabel(date: Date, timeframe: string): string {
  if (["1W"].includes(timeframe)) return date.toLocaleDateString("en-US", { weekday: "short" });
  if (["1M", "3M", "YTD"].includes(timeframe)) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function candlesToChartPoints(candles: Candle[], timeframe: string): ChartPoint[] {
  return candles.map((c) => {
    const date = new Date(c.timestamp);
    return {
      date: formatDateLabel(date, timeframe),
      price: c.close,
      open: c.open,
      close: c.close,
      high: c.high,
      low: c.low,
      body: [Math.min(c.open, c.close), Math.max(c.open, c.close)],
      wickRange: [c.low, c.high],
      up: c.close >= c.open,
      timestamp: date.getTime(),
      volume: c.volume ?? 0,
    };
  });
}

/** Real daily candle history from the Data Layer for a given UI timeframe.
 *  Returns `points: []` (not an error) for "1D" or for a symbol outside
 *  the current universe — callers should fall back to their own generated
 *  series in that case, same pattern as the rest of the live hooks. */
export function useHistoricalCandles(symbol: string | undefined, timeframe: string) {
  const days = timeframe === "YTD" ? undefined : TIMEFRAME_DAYS[timeframe];
  const isSupported = timeframe !== "1D" && !!symbol;

  const from = useMemo(() => {
    if (timeframe === "YTD") return new Date(new Date().getFullYear(), 0, 1).toISOString();
    if (days) return new Date(Date.now() - days * 86_400_000).toISOString();
    return undefined;
  }, [timeframe, days]);

  const query = useQuery({
    queryKey: ["continua", "historical", symbol, timeframe],
    queryFn: () => historicalApi.getCandles(symbol as string, { interval: "1d", from }),
    enabled: isSupported,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const points = useMemo(
    () => (query.data && query.data.length > 1 ? candlesToChartPoints(query.data, timeframe) : []),
    [query.data, timeframe]
  );

  return { points, isLoading: isSupported && query.isLoading, isSupported };
}
