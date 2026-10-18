import { useQueries } from "@tanstack/react-query";
import { researchApi } from "@/api/researchApi";
import type { ResearchBundle } from "@/api/types";

/** Real computed ratios + AfriScore for every symbol in the portfolio, in
 *  parallel — same endpoint the single-stock research view uses. Feeds the
 *  Analysis tab's Key Metrics & Benchmarks comparison against
 *  useMarketBenchmark's NSE sample. */
export function usePortfolioResearch(symbols: string[]) {
  const uniqueSymbols = [...new Set(symbols.filter(Boolean).map((s) => s.toUpperCase()))];

  const results = useQueries({
    queries: uniqueSymbols.map((symbol) => ({
      queryKey: ["continua", "research-c-score-v2", symbol],
      queryFn: () => researchApi.get(symbol),
      staleTime: 10 * 60_000,
      retry: 1,
    })),
  });

  const bySymbol: Record<string, ResearchBundle | undefined> = {};
  uniqueSymbols.forEach((symbol, i) => {
    bySymbol[symbol] = results[i]?.data;
  });

  return { research: bySymbol, isLoading: results.some((r) => r.isLoading) };
}
