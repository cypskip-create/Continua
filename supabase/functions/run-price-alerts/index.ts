// Scheduled, account-agnostic alert checker.
//
// check-price-alerts and check-indicator-alerts (the other two functions in
// this folder) are REACTIVE: they require a signed-in user's JWT and a
// symbol+price the client already has on screen, so they only ever fire
// while that exact user has that exact stock's live price open in the app.
// Nothing in the client ever called them either — so, in practice, no
// price or indicator alert has ever been checked. This function is the
// fix: it runs on a schedule (see the pg_cron migration alongside this
// file), needs no user session, and sweeps every active, untriggered alert
// for every user in one pass — so an alert fires whether or not anyone has
// the app open.
//
// Auth model: this is invoked by pg_cron via pg_net, not by a browser, so
// there's no user JWT to validate. It's instead gated on a shared secret
// (ALERTS_CRON_SECRET) sent as the `x-cron-secret` header — see the
// migration for how pg_cron supplies it via Supabase Vault. Registered in
// config.toml with verify_jwt = false for exactly this reason.
import "../deno.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface QuoteRow { symbol: string; lastPrice: number }
interface IndicatorApiResponse {
  data: {
    values: (number | null)[] | { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
  };
}

async function fetchQuotes(baseUrl: string, apiKey: string, exchange: string, symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (symbols.length === 0) return out;
  const url = new URL('/api/v1/quotes', baseUrl);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('symbols', symbols.join(','));
  const res = await fetch(url.toString(), { headers: { 'x-api-key': apiKey } });
  if (!res.ok) {
    console.error(`Batch quote fetch failed for ${exchange}:`, res.status, await res.text().catch(() => ''));
    return out;
  }
  const rows = (await res.json()) as QuoteRow[];
  for (const r of rows) out.set(r.symbol.toUpperCase(), r.lastPrice);
  return out;
}

async function fetchIndicatorSeries(baseUrl: string, apiKey: string, symbol: string, exchange: string, type: string, params: Record<string, string>): Promise<(number | null)[] | null> {
  const url = new URL(`/api/v1/indicators/${encodeURIComponent(symbol)}`, baseUrl);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('type', type);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { 'x-api-key': apiKey } });
  if (!res.ok) return null;
  const body = (await res.json()) as IndicatorApiResponse;
  return Array.isArray(body.data.values) ? body.data.values : null;
}

function detectCrossover(fast: (number | null)[], slow: (number | null)[]): 'bullish' | 'bearish' | null {
  const n = fast.length;
  if (n < 2 || slow.length < 2) return null;
  const f0 = fast[n - 2], f1 = fast[n - 1], s0 = slow[n - 2], s1 = slow[n - 1];
  if (f0 == null || f1 == null || s0 == null || s1 == null) return null;
  if (f0 <= s0 && f1 > s1) return 'bullish';
  if (f0 >= s0 && f1 < s1) return 'bearish';
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get('ALERTS_CRON_SECRET');
  const suppliedSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || suppliedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const baseUrl = Deno.env.get('CONTINUA_DATA_BASE_URL');
  const apiKey = Deno.env.get('CONTINUA_DATA_API_KEY');
  if (!baseUrl || !apiKey) {
    console.error('CONTINUA_DATA_BASE_URL / CONTINUA_DATA_API_KEY not configured — cannot run alert sweep');
    return new Response(JSON.stringify({ error: 'Data layer not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  try {
    const { data: alerts, error } = await supabaseAdmin
      .from('price_alerts')
      .select('*')
      .eq('is_active', true)
      .is('triggered_at', null);
    if (error) throw error;

    let priceChecked = 0, indicatorChecked = 0, triggered = 0;

    // ── Plain price alerts: one batched quote request per exchange ──
    const priceAlerts = (alerts ?? []).filter(a => !a.indicator);
    const byExchange = new Map<string, Set<string>>();
    for (const a of priceAlerts) {
      const ex = (a.exchange || 'NSE').toUpperCase();
      if (!byExchange.has(ex)) byExchange.set(ex, new Set());
      byExchange.get(ex)!.add(a.symbol.toUpperCase());
    }
    const quotesByExchange = new Map<string, Map<string, number>>();
    for (const [ex, symbols] of byExchange) {
      quotesByExchange.set(ex, await fetchQuotes(baseUrl, apiKey, ex, [...symbols]));
    }

    for (const alert of priceAlerts) {
      priceChecked++;
      const ex = (alert.exchange || 'NSE').toUpperCase();
      const price = quotesByExchange.get(ex)?.get(alert.symbol.toUpperCase());
      if (price == null || alert.target_value == null) continue;

      const isTriggered =
        (alert.alert_type === 'price_above' && price >= alert.target_value) ||
        (alert.alert_type === 'price_below' && price <= alert.target_value);
      if (!isTriggered) continue;

      await supabaseAdmin.from('price_alerts').update({ triggered_at: new Date().toISOString() }).eq('id', alert.id);
      const direction = alert.alert_type === 'price_above' ? 'risen above' : 'fallen below';
      const currency = alert.currency ?? 'KES';
      await supabaseAdmin.from('notifications').insert({
        user_id: alert.user_id, type: 'alert', feature: 'alerts',
        title: `${alert.symbol} alert triggered`,
        message: `${alert.symbol} has ${direction} ${currency} ${alert.target_value} (now ${currency} ${price.toFixed(2)})`,
        action_url: `/stock/${alert.symbol}`, entity_id: alert.id, entity_type: 'price_alert',
      });
      triggered++;
    }

    // ── Indicator alerts: one request per (symbol, exchange, indicator, period) ──
    const indicatorAlerts = (alerts ?? []).filter(a => !!a.indicator);
    const indicatorCache = new Map<string, (number | null)[] | null>();
    const cachedIndicator = async (symbol: string, exchange: string, type: string, period: string) => {
      const key = `${exchange}:${symbol}:${type}:${period}`;
      if (!indicatorCache.has(key)) {
        indicatorCache.set(key, await fetchIndicatorSeries(baseUrl, apiKey, symbol, exchange, type, { period }));
      }
      return indicatorCache.get(key) ?? null;
    };

    for (const alert of indicatorAlerts) {
      indicatorChecked++;
      const symbol = alert.symbol.toUpperCase();
      const ex = (alert.exchange || 'NSE').toUpperCase();
      const params = (alert.indicator_params ?? {}) as Record<string, number>;
      let isTriggered = false;
      let detail = '';

      if (alert.indicator === 'RSI') {
        const period = String(params.period ?? 14);
        const values = await cachedIndicator(symbol, ex, 'RSI', period);
        const latest = values?.length ? values[values.length - 1] : null;
        if (latest != null) {
          const threshold = params.threshold ?? 30;
          const condition = alert.alert_type === 'rsi_above' ? 'above' : 'below';
          isTriggered = condition === 'above' ? latest >= threshold : latest <= threshold;
          detail = `RSI(${period}) is ${latest.toFixed(1)}, ${condition === 'above' ? 'crossed above' : 'crossed below'} ${threshold}`;
        }
      } else if (alert.indicator === 'SMA_CROSS' || alert.indicator === 'EMA_CROSS') {
        const type = alert.indicator === 'SMA_CROSS' ? 'SMA' : 'EMA';
        const fastPeriod = String(params.fastPeriod ?? 10);
        const slowPeriod = String(params.slowPeriod ?? 30);
        const [fast, slow] = await Promise.all([
          cachedIndicator(symbol, ex, type, fastPeriod),
          cachedIndicator(symbol, ex, type, slowPeriod),
        ]);
        if (fast && slow) {
          const cross = detectCrossover(fast, slow);
          const wantDirection = params.direction === -1 ? 'bearish' : 'bullish';
          if (cross === wantDirection) {
            isTriggered = true;
            detail = `${type}(${fastPeriod}) crossed ${cross} through ${type}(${slowPeriod})`;
          }
        }
      }

      if (!isTriggered) continue;
      await supabaseAdmin.from('price_alerts').update({ triggered_at: new Date().toISOString() }).eq('id', alert.id);
      await supabaseAdmin.from('notifications').insert({
        user_id: alert.user_id, type: 'alert', feature: 'alerts',
        title: `${alert.symbol} indicator alert triggered`,
        message: detail || `${alert.symbol}'s ${alert.indicator} condition was met.`,
        action_url: `/stock/${alert.symbol}`, entity_id: alert.id, entity_type: 'price_alert',
      });
      triggered++;
    }

    console.log(`Alert sweep: ${priceChecked} price alerts, ${indicatorChecked} indicator alerts, ${triggered} triggered`);
    return new Response(JSON.stringify({ priceChecked, indicatorChecked, triggered }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Alert sweep failed:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});