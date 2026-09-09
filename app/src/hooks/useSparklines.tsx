import { useQuery } from "@tanstack/react-query";
import { historicalApi } from "@/api/historicalApi";

/** Batch real recent-closes for a page's worth of symbols, backing the
 *  small SparklineChart trend lines used across Watchlist, Markets,
 *  Screener, etc. One request per page instead of one per row.
 *
 *  A symbol absent from the result (not yet backfilled, or outside the
 *  tracked universe) has no data here — callers pass `undefined` through
 *  to SparklineChart, which renders an honest empty state rather than a
 *  fabricated line. Never invent a fallback series here. */
export function useSparklines(symbols: string[]) {
  const key = [...new Set(symbols.filter(Boolean))].sort();

  const query = useQuery({
    queryKey: ["continua", "sparklines", key],
    queryFn: () => historicalApi.getSparklines(key),
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return {
    getSparkline: (symbol: string): number[] | undefined => query.data?.[symbol],
    isLoading: query.isLoading,
  };
}