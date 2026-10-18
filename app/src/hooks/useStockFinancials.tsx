import { useQuery } from "@tanstack/react-query";
import { financialsApi } from "@/api/financialsApi";
import type { FiscalPeriodType } from "@/api/types";
import {isPublishedFinancialPeriod} from '@/lib/financialCoverage';

/** Real financial statements for one stock. History includes the stored
 * income, balance-sheet, and cash-flow fields for each reported period.
 * Missing source fields remain null; callers must not infer a zero value.
 *
 *  Defaults to 20 annual or 50 quarterly periods so historical filings
 *  from 2015 onward are available to research charts. Explicit limits
 *  still support shorter windows. */
export function useStockFinancials(
  symbol: string | undefined,
  opts: { periodType?: FiscalPeriodType; limit?: number; publisherObservations?:boolean } = {},
) {
  const { periodType = "annual" } = opts;
  const limit = opts.limit ?? (periodType === "annual" ? 20 : 50);

  const history = useQuery({
    queryKey: ["continua", "financials-history", symbol, periodType, limit],
    queryFn: () => financialsApi.getHistory(symbol as string, { periodType, limit }),
    enabled: !!symbol,
    staleTime: 30 * 60_000,
    refetchOnMount: true,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  // Both summaries and expanded details consume the same backend read model.
  // Publisher source-cell mapping and conflict reconciliation run on the server.
  const combined=(history.data??[]).filter(row=>isPublishedFinancialPeriod(row));
  return {
    history: combined,
    usingPublisherObservations:combined.some(row=>row.basis==='publisher_observation'),
    latest: combined.at(-1),
    isLoading: history.isLoading,
    historyError: history.error,
    refetchHistory: history.refetch,
  };
}
