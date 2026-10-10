import { useQuery } from "@tanstack/react-query";
import { instrumentsApi } from "@/api/instrumentsApi";
import { useExchange } from "@/hooks/useExchange";

export function useInstruments(exchange?: string) {
  const { exchange: selectedExchange } = useExchange();
  const activeExchange = exchange ?? selectedExchange;

  const query = useQuery({
    queryKey: ["continua", "instruments", activeExchange],
    queryFn: () => instrumentsApi.list(activeExchange),
    staleTime: 300_000,
    retry: 1,
  });

  return {
    instruments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
