import { useQuery } from "@tanstack/react-query";
import { screenerApi } from "@/api/screenerApi";

export interface BenchmarkAverages {
  pe: number | null;
  dividendYield: number | null;
  priceMomentum3m: number | null;
  debtToEquity: number | null;
  roe: number | null;
  sampleSize: number;
  sampleLabel: string;
}

function average(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

const SAMPLE_SIZE = 15;

/** Market-cap sample, not the full exchange. The screener supplies all
 * benchmark ratios in one read; do not fan out fifteen company requests. */
export function useMarketBenchmark() {
  const sampleQuery = useQuery({
    queryKey: ["continua", "screener", "market-cap-sample", SAMPLE_SIZE],
    queryFn: () => screenerApi.run({ sortBy: "marketCap", sortDirection: "desc", limit: SAMPLE_SIZE }),
    staleTime: 15 * 60_000,
  });

  const rows = sampleQuery.data ?? [];

  const isLoading = sampleQuery.isLoading;

  const averages: BenchmarkAverages = {
    pe: average(rows.map((r) => r.pe)),
    dividendYield: average(rows.map((r) => r.dividendYield)),
    priceMomentum3m: average(rows.map((r) => r.priceMomentum3m)),
    debtToEquity: average(rows.map((r) => r.debtToEquity)),
    roe: average(rows.map((r) => r.roe)),
    sampleSize: rows.length,
    sampleLabel: `NSE Top ${rows.length || SAMPLE_SIZE} by Market Cap`,
  };

  return { averages, isLoading };
}
