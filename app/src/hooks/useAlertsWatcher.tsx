import { useEffect, useRef, useState } from "react";
import { usePriceAlerts } from "./usePriceAlerts";
import { useLiveQuotes } from "./useLiveQuotes";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Runs app-wide (mounted once in MainLayout) so a plain price alert can
 * fire the moment its condition is met while the app is open — instead of
 * waiting for the background pg_cron sweep, which only runs every 5
 * minutes (see supabase/functions/run-price-alerts). That sweep is the
 * part that makes alerts fire even with the app closed; this hook is
 * purely a faster path for the common case of actually having the app
 * open, using live quotes the app is already subscribed to.
 *
 * Only handles price_above/price_below — indicator alerts (RSI/SMA/EMA
 * cross) don't move on every price tick the way a quote does, so they're
 * left entirely to the cron sweep rather than re-fetched here on every
 * render.
 */
export function useAlertsWatcher() {
  const { user } = useAuth();
  const { alerts, refetch } = usePriceAlerts();

  const activePriceAlerts = alerts.filter(a => a.is_active && !a.triggered_at && !a.indicator);
  const symbols = [...new Set(activePriceAlerts.map(a => a.symbol.toUpperCase()))];
  const { quotes } = useLiveQuotes(symbols);

  // Don't re-invoke the edge function for a price that hasn't moved since
  // the last check for that symbol.
  const lastChecked = useRef<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRetryTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const alertSignature = activePriceAlerts.map(a => [a.id, a.target_value, a.exchange].join(':')).sort().join('|');

  useEffect(() => {
    if (!user || symbols.length === 0) return;

    for (const symbol of symbols) {
      const q = quotes[symbol];
      if (!q) continue;
      const checkKey = `${user.id}:${symbol}:${q.exchange}:${q.lastPrice}:${q.timestamp}:${alertSignature}`;
      if (lastChecked.current[symbol] === checkKey || inFlight.current.has(symbol)) continue;

      const symbolAlerts = activePriceAlerts.filter(a => a.symbol.toUpperCase() === symbol && a.exchange === q.exchange);
      const mightTrigger = symbolAlerts.some(a =>
        (a.alert_type === "price_above" && a.target_value != null && q.lastPrice >= a.target_value) ||
        (a.alert_type === "price_below" && a.target_value != null && q.lastPrice <= a.target_value)
      );

      if (!mightTrigger) continue;

      inFlight.current.add(symbol);
      supabase.functions
        .invoke("check-price-alerts", {
          body: { symbol, currentPrice: q.lastPrice, exchange: symbolAlerts[0]?.exchange ?? "NSE" },
        })
        .then(({ data, error }) => {
          if (error) throw error;
          lastChecked.current[symbol] = checkKey;
          if (data?.triggered > 0) void refetch();
        })
        .catch(() => { /* Retry on the next tick; do not mark failed requests checked. */ })
        .finally(() => inFlight.current.delete(symbol));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, user, symbols.join(","), alertSignature, retryTick]);
}
