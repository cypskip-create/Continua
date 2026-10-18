import { useQuery } from "@tanstack/react-query";
import { valuationApi } from "@/api/valuationApi";
import { useExchange } from "@/hooks/useExchange";

/** Multiple valuation models (sector-relative P/E, Graham Number, DDM) for
 *  a symbol — see backend/src/services/technical/valuationService.ts.
 *  Each model in the response may have `fairValue: null` with an
 *  `unavailableReason` instead of a number; render that reason rather than
 *  hiding the model, so users understand why a given model didn't apply. */
export function useValuation(symbol: string, exchange?: string) {
  const { exchange: selectedExchange } = useExchange();
  const activeExchange = exchange ?? selectedExchange;

  const query = useQuery({
    queryKey: ["continua", "valuation-rating-v3", activeExchange, symbol],
    queryFn: () => valuationApi.get(symbol, activeExchange),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return { valuation: query.data, isLoading: query.isLoading, isError: query.isError };
}
