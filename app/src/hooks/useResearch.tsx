import { useQuery } from "@tanstack/react-query";
import { researchApi } from "@/api/researchApi";
import { isNotFound } from "@/api/client";
import {useStockFinancials} from './useStockFinancials';

/** Ratios and C score come from the Engine. Known companies with insufficient
 * evidence return an explicit unavailable score; there is no local heuristic. */
export function useResearch(symbol: string | undefined) {
  const financials=useStockFinancials(symbol);
  const query = useQuery({
    queryKey: ["continua", "research-c-score-v2", symbol],
    queryFn: () => researchApi.get(symbol as string),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });

  return {
    research: query.data,
    publisherRatios:financials.latest?.basis==='publisher_observation'?financials.latest.ratios:undefined,
    isLoading: query.isLoading,
    isNotCovered: isNotFound(query.error),
  };
}
