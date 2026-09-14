import { useQuery } from "@tanstack/react-query";
import { corporateActionsApi } from "@/api/corporateActionsApi";

/** Real, forward-looking dividend calendar — see UpcomingDividend in
 *  api/types.ts for why ex-dates are safe to show as upcoming (they're a
 *  fact stated in the company's own announcement, not a prediction). */
export function useUpcomingDividends(exchange = "NSE", limit = 20) {
  const query = useQuery({
    queryKey: ["continua", "dividends", "upcoming", exchange, limit],
    queryFn: () => corporateActionsApi.getUpcomingDividends(exchange, limit),
    staleTime: 30 * 60_000,
  });
  return { dividends: query.data ?? [], isLoading: query.isLoading };
}

/** Real, already-reported earnings — never a forward "expected" calendar,
 *  since nothing in this system has a real analyst-estimates source. */
export function useRecentEarnings(exchange = "NSE", limit = 20) {
  const query = useQuery({
    queryKey: ["continua", "earnings", "recent", exchange, limit],
    queryFn: () => corporateActionsApi.getRecentEarnings(exchange, limit),
    staleTime: 30 * 60_000,
  });
  return { earnings: query.data ?? [], isLoading: query.isLoading };
}