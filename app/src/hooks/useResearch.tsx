import { useQuery } from "@tanstack/react-query";
import { researchApi } from "@/api/researchApi";
import { isNotFound } from "@/api/client";
import {usePublisherResearch} from './usePublisherResearch';

/** Ratios + AfriScore for one symbol, computed by the Data Layer's
 *  calculation engine (backend/src/services/research/) rather than the
 *  frontend's own heuristic. Returns `undefined` for `data` when the
 *  symbol isn't covered yet (404) — callers should fall back to their own
 *  estimate in that case rather than showing an error. */
export function useResearch(symbol: string | undefined) {
  const publisher=usePublisherResearch(symbol);
  const query = useQuery({
    queryKey: ["continua", "research", symbol],
    queryFn: () => researchApi.get(symbol as string),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });

  return {
    research: query.data,
    publisherRatios:publisher.data?.find(r=>r.companyResearch?.latest)?.companyResearch?.latest?.ratios,
    isLoading: query.isLoading,
    isNotCovered: isNotFound(query.error),
  };
}
