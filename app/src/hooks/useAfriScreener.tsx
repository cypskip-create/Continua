import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { screenerApi } from "@/api/screenerApi";
import { useLiveQuotes } from "./useLiveQuotes";

export interface AfriScreenerRow {
  symbol: string;
  marketCap: string; // magnitude-suffixed string ("237.5B"), matching stockPrices.ts's convention
  pe: number | null;
  dividendYield: number | null;
  afriScore: number | null;
  price?: number;
  changePercent?: number;
}

function formatMagnitude(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

/** Real marketCap/PE/dividend-yield/AfriScore for the whole exchange in
 *  ONE batched call to the Data Layer's `/screener` endpoint — far cheaper
 *  than calling `/research/:symbol` per row. Combined with the same shared
 *  live-quote hook everything else uses, so a screener row's price can't
 *  disagree with what Watchlist/Markets/StockDetail show for that symbol.
 *  Returns a lookup keyed by symbol; callers overlay it onto their own
 *  per-symbol rows and keep whatever fields the Data Layer doesn't cover
 *  (volume, beta, RSI) on their existing source. */
export function useAfriScreener(symbols: string[]) {
  const screenerQuery = useQuery({
    queryKey: ["continua", "screener", "full"],
    queryFn: () => screenerApi.run({ limit: 200, sortBy: "afriScore", sortDirection: "desc" }),
    staleTime: 60_000,
    retry: 1,
  });
  const { quotes } = useLiveQuotes(symbols);

  const bySymbol = useMemo(() => {
    const map: Record<string, AfriScreenerRow> = {};
    (screenerQuery.data ?? []).forEach((row) => {
      map[row.symbol] = {
        symbol: row.symbol,
        marketCap: row.marketCap == null ? '—' : formatMagnitude(row.marketCap),
        pe: row.pe,
        dividendYield: row.dividendYield == null ? null : row.dividendYield * 100,
        afriScore: row.afriScore ?? null,
      };
    });
    Object.values(quotes).forEach((q) => {
      if (map[q.symbol]) {
        map[q.symbol].price = q.lastPrice;
        map[q.symbol].changePercent = q.changePercent;
      }
    });
    return map;
  }, [screenerQuery.data, quotes]);

  return { bySymbol, isLoading: screenerQuery.isLoading };
}
