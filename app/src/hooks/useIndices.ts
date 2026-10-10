import { useQuery } from "@tanstack/react-query";
import { indicesApi } from "@/api/indicesApi";
import { useExchange } from "@/hooks/useExchange";

/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
export function useIndices(exchange?: string) {
  const { exchange: selectedExchange } = useExchange();
  const activeExchange = exchange ?? selectedExchange;

  const query = useQuery({
    queryKey: ["continua", "indices", activeExchange],
    queryFn: () => indicesApi.list(activeExchange),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  return {
    indices: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
