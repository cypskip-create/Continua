import { useEffect, useRef } from "react";
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
  const lastChecked = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!user || symbols.length === 0) return;

    for (const symbol of symbols) {
      const q = quotes[symbol];
      if (!q) continue;
      if (lastChecked.current[symbol] === q.lastPrice) continue;

      const symbolAlerts = activePriceAlerts.filter(a => a.symbol.toUpperCase() === symbol);
      const mightTrigger = symbolAlerts.some(a =>
        (a.alert_type === "price_above" && a.target_value != null && q.lastPrice >= a.target_value) ||
        (a.alert_type === "price_below" && a.target_value != null && q.lastPrice <= a.target_value)
      );
      lastChecked.current[symbol] = q.lastPrice;
      if (!mightTrigger) continue;

      supabase.functions
        .invoke("check-price-alerts", {
          body: { symbol, currentPrice: q.lastPrice, exchange: symbolAlerts[0]?.exchange ?? "NSE" },
        })
        .then(({ data }) => { if (data?.triggered > 0) refetch(); })
        .catch(() => { /* best-effort — the cron sweep will still catch it within 5 minutes */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, user, symbols.join(",")]);
}