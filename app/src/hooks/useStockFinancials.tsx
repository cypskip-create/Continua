import { useQuery } from "@tanstack/react-query";
import { financialsApi } from "@/api/financialsApi";
import type { FiscalPeriodType } from "@/api/types";
import {isPublishedFinancialPeriod} from '@/lib/financialCoverage';
import {usePublisherResearch,publisherFinancialPeriods} from './usePublisherResearch';

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
  const publisher=usePublisherResearch(symbol,opts.publisherObservations===true&&periodType==='annual');

  const history = useQuery({
    queryKey: ["continua", "financials-history", symbol, periodType, limit],
    queryFn: () => financialsApi.getHistory(symbol as string, { periodType, limit }),
    enabled: !!symbol,
    staleTime: 30 * 60_000,
    refetchOnMount: true,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const latest = useQuery({
    queryKey: ["continua", "financials-latest", symbol, periodType],
    queryFn: () => financialsApi.getLatest(symbol as string, { periodType }),
    enabled: !!symbol,
    staleTime: 30 * 60_000,
    refetchOnMount: true,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const verified=(history.data??[]).filter(row=>isPublishedFinancialPeriod(row));
  const assembled=publisher.data?.find(r=>r.companyResearch?.version===1)?.companyResearch;
  const observed=assembled?.history.map(r=>({...r,basis:'publisher_observation' as const}))??publisherFinancialPeriods(publisher.data??[]);
  const supplements=opts.publisherObservations&&periodType==='annual'?observed.filter(p=>!verified.some(v=>v.fiscalYear===p.fiscalYear)):[];
  const combined=opts.publisherObservations&&periodType==='annual'?[...verified,...supplements].sort((a,b)=>a.fiscalYear-b.fiscalYear).slice(-limit):verified;
  return {
    history: combined,
    usingPublisherObservations:combined.some(r=>r.basis==='publisher_observation'),
    latest: opts.publisherObservations&&periodType==='annual'?combined.at(-1):latest.data && isPublishedFinancialPeriod(latest.data) ? latest.data : undefined,
    isLoading: history.isLoading || latest.isLoading,
    historyError: history.error,
    refetchHistory: history.refetch,
  };
}
