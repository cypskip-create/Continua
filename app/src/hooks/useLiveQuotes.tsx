import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { quotesApi } from "@/api/quotesApi";
import { continuaRealtime } from "@/api/websocketClient";
import { useExchange } from "@/hooks/useExchange";
import type { Quote } from "@/api/types";
import { readQuoteSnapshot, writeQuoteSnapshot } from "@/lib/quoteSnapshotCache";

/**
 * The single hook every screen should use to get live Continua quotes.
 * REST gives the initial snapshot (and a periodic safety-net refetch);
 * the shared WebSocket connection (api/websocketClient.ts) layers live
 * ticks on top as they arrive. Multiple components calling this with
 * overlapping symbol sets share the same underlying WS subscriptions.
 *
 * `exchange` defaults to the app's globally-selected market (see
 * hooks/useExchange.tsx) and is threaded through to the REST call. The
 * WebSocket layer (websocketClient.ts's subscribeQuote) does NOT yet take
 * an exchange param — it was built when NSE was the only exchange, and
 * generalizing the streaming protocol to be exchange-aware is backend work
 * outside this change (see docs/architecture/MARKET_DATA_ENGINE.md). In
 * practice this matters little for non-NSE exchanges: Mansa's own data is
 * ~30-minute-refresh, not tick-level, so the REST poll below (staleTime
 * 15s, refetchInterval 30s) already reflects Mansa-backed quotes about as
 * promptly as a live tick would.
 *
 * Symbols the Data Layer doesn't know about (outside the current NSE mock
 * universe, or a future exchange not yet onboarded) simply won't appear in
 * `quotes` — callers should treat a missing symbol as "not covered yet",
 * not as an error, and fall back to their own display data if needed.
 */
export function useLiveQuotes(symbols: string[], exchange?: string) {
  const { exchange: selectedExchange } = useExchange();
  const activeExchange = exchange ?? selectedExchange;

  const normalized = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase()))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbols.join(",")]
  );
  const key = normalized.join(",");
  const persistedSnapshot = useMemo(
    () => readQuoteSnapshot(activeExchange, normalized),
    [activeExchange, normalized]
  );

  const query = useQuery({
    queryKey: ["continua", "quotes", activeExchange, key],
    queryFn: () => quotesApi.getBatch(normalized, activeExchange),
    enabled: normalized.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    initialData: persistedSnapshot?.quotes,
    initialDataUpdatedAt: persistedSnapshot?.savedAt ?? 0,
    retry: 1,
  });

  const [liveTicks, setLiveTicks] = useState<Record<string, Quote>>({});
  const [isConnected, setIsConnected] = useState(continuaRealtime.isConnected());

  useEffect(() => {
    setLiveTicks({});
    const unsubscribers = normalized.map((symbol) =>
      continuaRealtime.subscribeQuote(symbol, (quote) => {
        if (quote.exchange !== activeExchange) return;
        setLiveTicks((prev) => ({ ...prev, [symbol]: quote }));
      })
    );
    return () => unsubscribers.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activeExchange]);

  useEffect(() => continuaRealtime.onConnectionChange(setIsConnected), []);

  const quotes = useMemo(() => {
    const map: Record<string, Quote> = {};
    (query.data ?? []).forEach((q) => { map[q.symbol.toUpperCase()] = q; });
    Object.values(liveTicks).forEach((q) => {
      if (q.exchange !== activeExchange) return;
      const current = map[q.symbol.toUpperCase()];
      if (!current || new Date(q.timestamp).getTime() >= new Date(current.timestamp).getTime()) map[q.symbol.toUpperCase()] = q;
    });
    return map;
  }, [query.data, liveTicks, activeExchange]);

  useEffect(() => {
    const snapshot = Object.values(quotes);
    if (snapshot.length === 0) return;
    const timer = window.setTimeout(() => writeQuoteSnapshot(activeExchange, snapshot), 250);
    return () => window.clearTimeout(timer);
  }, [activeExchange, quotes]);

  return {
    quotes,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isConnected,
    refetch: query.refetch,
  };
}

/** Single-symbol convenience wrapper over useLiveQuotes. */
export function useLiveQuote(symbol: string | undefined) {
  const { quotes, isLoading, isError, error, isConnected, refetch } = useLiveQuotes(symbol ? [symbol] : []);
  const quote = symbol ? quotes[symbol.toUpperCase()] : undefined;
  return { quote, isLoading, isError, error, isConnected, refetch };
}

/** Shapes a set of holdings' live quotes for computePortfolioStats
 *  (lib/stockPrices.ts) — {symbol -> {price, dayChangeAbs}}, keyed the same
 *  way that function looks them up. Used by every page that shows
 *  portfolio-level totals (Home, Discover, Track Investments) so they all
 *  price a holding identically. */
export function useLivePortfolioQuotes(symbols: string[]) {
  const { quotes, isConnected } = useLiveQuotes(symbols);
  const liveQuotes = useMemo(() => {
    const map: Record<string, { price: number; dayChangeAbs: number }> = {};
    Object.values(quotes).forEach((q) => {
      map[q.symbol.toUpperCase()] = { price: q.lastPrice, dayChangeAbs: q.change };
    });
    return map;
  }, [quotes]);
  return { liveQuotes, isConnected };
}
