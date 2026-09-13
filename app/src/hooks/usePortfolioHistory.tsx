import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { historicalApi } from "@/api/historicalApi";

export interface PortfolioHistoryPoint {
  /** yyyy-MM-dd */
  date: string;
  timestamp: number;
  value: number;
}

const TIMEFRAME_DAYS: Record<string, number | undefined> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "YTD": undefined, // computed specially, see below
  "1Y": 365,
  "ALL": 400, // matches the backend's candle backfill window (candlesWorker.ts)
};

/**
 * Real historical portfolio value: one real daily-candle series per
 * holding — the exact same `/historical/:symbol` source StockDetail's own
 * chart uses — summed by date using each holding's CURRENT share count.
 *
 * This intentionally does NOT replay historical position sizes (the app
 * has no lot-level transaction history to replay), so what it answers is
 * "what would this exact portfolio be worth on date X, held at today's
 * size" — a real, non-fabricated price series, just not point-in-time
 * accurate for someone who changed position sizes mid-window. That's a
 * real limitation worth knowing, not a reason to fabricate a curve that
 * hides it.
 *
 * "1D" isn't covered here, same reason `useHistoricalCandles` skips it —
 * no intraday candle source exists yet (see that hook's note). Callers
 * should keep a generated/estimated shape for that one timeframe only.
 */
export function usePortfolioHistory(holdings: { symbol: string; shares: number }[], timeframe: string) {
  const days = timeframe === "YTD" ? undefined : TIMEFRAME_DAYS[timeframe];
  const supported = timeframe !== "1D" && holdings.length > 0;

  const from = useMemo(() => {
    if (timeframe === "YTD") return new Date(new Date().getFullYear(), 0, 1).toISOString();
    if (days) return new Date(Date.now() - days * 86_400_000).toISOString();
    return undefined;
  }, [timeframe, days]);

  const symbols = useMemo(
    () => [...new Set(holdings.map((h) => h.symbol.toUpperCase()))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holdings.map((h) => h.symbol).join(",")]
  );

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["continua", "portfolio-history-candles", symbol, timeframe],
      queryFn: () => historicalApi.getCandles(symbol, { interval: "1d" as const, from }),
      enabled: supported && !!from,
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  const isLoading = supported && results.some((r) => r.isLoading);

  const points = useMemo((): PortfolioHistoryPoint[] => {
    if (!supported) return [];

    const perSymbol = new Map<string, Map<string, number>>(); // symbol -> "yyyy-MM-dd" -> close
    symbols.forEach((symbol, i) => {
      const candles = (results[i]?.data as { timestamp: string | number; close: number }[] | undefined) ?? [];
      const byDate = new Map<string, number>();
      for (const c of candles) byDate.set(new Date(c.timestamp).toISOString().slice(0, 10), c.close);
      perSymbol.set(symbol, byDate);
    });

    const allDates = new Set<string>();
    perSymbol.forEach((byDate) => byDate.forEach((_, d) => allDates.add(d)));
    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return [];

    // Forward-fills a holding across a date none of its own candles cover
    // (e.g. a thinly-traded stock with no print that day) using its own
    // last real close — never another holding's price, never a guess.
    const lastKnown = new Map<string, number>();
    const out: PortfolioHistoryPoint[] = [];
    for (const d of sortedDates) {
      let value = 0;
      let anyPriced = false;
      for (const h of holdings) {
        const sym = h.symbol.toUpperCase();
        const close = perSymbol.get(sym)?.get(d);
        if (close != null) lastKnown.set(sym, close);
        const price = close ?? lastKnown.get(sym);
        if (price != null) {
          value += price * h.shares;
          anyPriced = true;
        }
      }
      if (anyPriced) out.push({ date: d, timestamp: new Date(d).getTime(), value });
    }
    return out;
  }, [results, symbols, holdings, supported]);

  return { points, isLoading, hasRealData: points.length >= 2 };
}