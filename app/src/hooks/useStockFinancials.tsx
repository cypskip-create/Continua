import { useQuery } from "@tanstack/react-query";
import { financialsApi } from "@/api/financialsApi";
import type { FiscalPeriodType } from "@/api/types";

/** Real financial statements for one stock, used across the Growth,
 *  Performance, and Health research tabs. `history` only carries
 *  revenue/netIncome/eps per the backend's history endpoint — no
 *  balance-sheet or cash-flow time series is available, so those tabs show
 *  the `latest` full statement bundle as a current snapshot rather than
 *  inventing a multi-year trend.
 *
 *  Defaults to the last 5 annual periods (unchanged for every existing
 *  caller). Pass `{ periodType: "quarterly", limit: 5 }` for a quarterly
 *  series, or a smaller `limit` for a shorter annual window. */
export function useStockFinancials(
  symbol: string | undefined,
  opts: { periodType?: FiscalPeriodType; limit?: number } = {},
) {
  const { periodType = "annual", limit = 5 } = opts;

  const history = useQuery({
    queryKey: ["continua", "financials-history", symbol, periodType, limit],
    queryFn: () => financialsApi.getHistory(symbol as string, { periodType, limit }),
    enabled: !!symbol,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const latest = useQuery({
    queryKey: ["continua", "financials-latest", symbol],
    queryFn: () => financialsApi.getLatest(symbol as string),
    enabled: !!symbol,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  return {
    history: history.data ?? [],
    latest: latest.data,
    isLoading: history.isLoading || latest.isLoading,
  };
}