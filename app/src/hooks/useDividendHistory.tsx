import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { corporateActionsApi } from "@/api/corporateActionsApi";
import { isNotFound } from "@/api/client";

export interface DividendYear {
  year: string;
  dps: number;
}

/** Real dividend-per-share history, from the Data Layer's dividend
 *  corporate actions (interim + final payouts summed per calendar year,
 *  keyed off ex-date). Returns `history: []` — not an error — when the
 *  symbol has no dividend actions on record yet, so callers fall back to
 *  their own estimate rather than showing an empty chart as if that were
 *  confirmed fact. */
export function useDividendHistory(symbol: string | undefined) {
  const query = useQuery({
    queryKey: ["continua", "dividends", symbol],
    queryFn: () => corporateActionsApi.getDividends(symbol as string),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });

  const history = useMemo<DividendYear[]>(() => {
    const actions = query.data ?? [];
    const byYear = new Map<string, number>();
    for (const action of actions) {
      if (action.status === "cancelled" || action.type !== "dividend") continue;
      const amount = Number((action.details as { amountPerShare?: number })?.amountPerShare ?? 0);
      const dateStr = action.exDate;
      if (!dateStr || !amount || !Number.isFinite(Date.parse(dateStr)) || Date.parse(dateStr) > Date.now()) continue;
      const year = String(new Date(dateStr).getFullYear());
      byYear.set(year, (byYear.get(year) ?? 0) + amount);
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, dps]) => ({ year, dps: +dps.toFixed(2) }));
  }, [query.data]);

  return { history, isLoading: query.isLoading };
}
