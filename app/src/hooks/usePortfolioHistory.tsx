import {portfolioValueHistory} from '@/lib/portfolioHistory';
import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { observedHistory } from "@/api/observedHistory";
import {priceWindow} from "@/lib/priceHistory";

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
  "ALL": 3600,
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
 * must show an unavailable state instead of inventing intraday performance.
 */
export function usePortfolioHistory(holdings: { symbol: string; shares: number }[], timeframe: string) {
  const client = useQueryClient();
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
      queryKey: ["continua", "observed-price-history-v2", symbol, timeframe, priceWindow(timeframe).from, priceWindow(timeframe).to],
      queryFn: () => observedHistory(symbol,timeframe),
      placeholderData: () => client.getQueryCache().findAll({queryKey: ['continua', 'observed-price-history-v2', symbol, timeframe]})
        .filter(query => Date.now() - query.state.dataUpdatedAt < 86_400_000)
        .sort((a,b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]?.state.data as Awaited<ReturnType<typeof observedHistory>> | undefined,
      enabled: supported && !!from,
      staleTime: 5 * 60_000, refetchOnMount: 'always',
      retry: 1,
    })),
  });

  const isLoading = supported && results.some((r) => r.isLoading);

  const points = useMemo((): PortfolioHistoryPoint[] => supported ? portfolioValueHistory(holdings,Object.fromEntries(symbols.map((symbol,index)=>[symbol,results[index]?.data??[]]))) : [], [holdings,symbols,results,supported]);

  return { points, isLoading, hasRealData: points.length >= 2 };
}
