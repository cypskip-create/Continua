import { useQuery } from "@tanstack/react-query";
import { volumeProfileApi } from "@/api/volumeProfileApi";
import { useExchange } from "@/hooks/useExchange";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export function useVolumeProfile(symbol: string, from?: string, to?: string, exchange?: string) {
  const { exchange: selectedExchange } = useExchange();
  const { user } = useAuth();
  const { profile } = useProfile();
  const paid = profile?.subscription_plan === "premium" || profile?.subscription_plan === "premium_plus";
  const activeExchange = exchange ?? selectedExchange;

  const query = useQuery({
    queryKey: ["continua", "volume-profile", user?.id, activeExchange, symbol, from, to],
    queryFn: () => volumeProfileApi.get(symbol, activeExchange, from, to),
    enabled: !!symbol && !!user && paid,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  return { profile: query.data, isLoading: query.isLoading, isError: query.isError };
}
