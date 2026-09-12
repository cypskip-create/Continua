// Evaluates indicator-based alerts (RSI threshold, SMA/EMA crossover)
// for one symbol — the indicator-alert counterpart to check-price-alerts,
// which only ever handles plain price_above/price_below alerts (see the
// `.is('indicator', null)` filter added there). Follows the exact same
// inline auth/CORS pattern as check-price-alerts/index.ts rather than
// pulling in a shared module, since none exists on this branch yet (see
// docs/architecture/MARKET_DATA_ENGINE.md's Edge Functions section on the
// trading-engine branch for that pattern, if it's ever merged in).
//
// Unlike a price alert (where the client already has the current price
// from the quote it just displayed), evaluating an indicator means asking
// the Continua Data backend to compute one — this function calls
// GET /indicators/:symbol on that backend using a server-side API key
// (CONTINUA_DATA_API_KEY / CONTINUA_DATA_BASE_URL secrets), never exposed
// to the client.
import "../deno.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IndicatorApiResponse {
  data: {
    values: (number | null)[] | { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
    latest: number | { macd: number | null; signal: number | null; histogram: number | null } | null;
  };
}

async function fetchIndicatorSeries(symbol: string, exchange: string, type: string, params: Record<string, string>): Promise<(number | null)[] | null> {
  const baseUrl = Deno.env.get('CONTINUA_DATA_BASE_URL');
  const apiKey = Deno.env.get('CONTINUA_DATA_API_KEY');
  if (!baseUrl || !apiKey) {
    console.error('CONTINUA_DATA_BASE_URL / CONTINUA_DATA_API_KEY not configured — cannot evaluate indicator alerts');
    return null;
  }

  const url = new URL(`/api/v1/indicators/${encodeURIComponent(symbol)}`, baseUrl);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('type', type);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: { 'x-api-key': apiKey } });
  if (!res.ok) {
    console.error(`Indicator fetch failed for ${symbol} (${type}):`, res.status, await res.text().catch(() => ''));
    return null;
  }
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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized - missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub as string;

    const { symbol, exchange } = await req.json();
    if (!symbol || typeof symbol !== 'string' || symbol.length > 20) {
      return new Response(JSON.stringify({ error: 'Invalid symbol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const sanitizedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const exch = typeof exchange === 'string' && exchange.length > 0 ? exchange.toUpperCase() : 'NSE';

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: alerts, error } = await supabaseAdmin
      .from('price_alerts')
      .select('*')
      .eq('symbol', sanitizedSymbol)
      .eq('exchange', exch)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('triggered_at', null)
      .not('indicator', 'is', null);

    if (error) throw error;

    const triggeredAlerts = [];

    for (const alert of alerts ?? []) {
      const params = (alert.indicator_params ?? {}) as Record<string, number>;
      let triggered = false;
      let detail = '';

      if (alert.indicator === 'RSI') {
        const period = String(params.period ?? 14);
        const values = await fetchIndicatorSeries(sanitizedSymbol, exch, 'RSI', { period });
        const latest = values?.length ? values[values.length - 1] : null;
        if (latest != null) {
          const threshold = params.threshold ?? 30;
          const condition = alert.alert_type === 'rsi_above' ? 'above' : 'below';
          triggered = condition === 'above' ? latest >= threshold : latest <= threshold;
          detail = `RSI(${period}) is ${latest.toFixed(1)}, ${condition === 'above' ? 'crossed above' : 'crossed below'} ${threshold}`;
        }
      } else if (alert.indicator === 'SMA_CROSS' || alert.indicator === 'EMA_CROSS') {
        const type = alert.indicator === 'SMA_CROSS' ? 'SMA' : 'EMA';
        const fastPeriod = String(params.fastPeriod ?? 10);
        const slowPeriod = String(params.slowPeriod ?? 30);
        const [fast, slow] = await Promise.all([
          fetchIndicatorSeries(sanitizedSymbol, exch, type, { period: fastPeriod }),
          fetchIndicatorSeries(sanitizedSymbol, exch, type, { period: slowPeriod }),
        ]);
        if (fast && slow) {
          const cross = detectCrossover(fast, slow);
          const wantDirection = params.direction === -1 ? 'bearish' : 'bullish'; // stored as 1/-1 in indicator_params.direction
          if (cross === wantDirection) {
            triggered = true;
            detail = `${type}(${fastPeriod}) crossed ${cross} through ${type}(${slowPeriod})`;
          }
        }
      }

      if (triggered) {
        await supabaseAdmin.from('price_alerts').update({ triggered_at: new Date().toISOString() }).eq('id', alert.id).eq('user_id', userId);
        await supabaseAdmin.from('notifications').insert({
          user_id: userId, type: 'alert', feature: 'alerts',
          title: `${alert.symbol} indicator alert triggered`,
          message: detail || `${alert.symbol}'s ${alert.indicator} condition was met.`,
          action_url: `/stock/${alert.symbol}`, entity_id: alert.id, entity_type: 'price_alert',
        });
        triggeredAlerts.push(alert);
      }
    }

    return new Response(JSON.stringify({ checked: alerts?.length ?? 0, triggered: triggeredAlerts.length, alerts: triggeredAlerts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});