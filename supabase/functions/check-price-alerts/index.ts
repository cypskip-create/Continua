import "../deno.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing or invalid authorization header' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth token for validation
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Token validation failed:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - no user ID in token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const { symbol, currentPrice, exchange } = await req.json();
    const exch = typeof exchange === 'string' && exchange.length > 0 ? exchange.toUpperCase() : 'NSE';
    
    if (!symbol || typeof symbol !== 'string' || symbol.length > 20) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol - must be a string up to 20 characters' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof currentPrice !== 'number' || isNaN(currentPrice) || currentPrice < 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid currentPrice - must be a positive number' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize symbol (uppercase, alphanumeric only)
    const sanitizedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    console.log('Checking alerts for authenticated user:', { userId, symbol: sanitizedSymbol, exchange: exch, currentPrice });

    // Use service role client for database operations (to update alerts)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get only alerts for the authenticated user and specified symbol+exchange.
    // Also excludes indicator-based alerts (indicator IS NOT NULL) — those
    // are evaluated by check-indicator-alerts, which calls the technical
    // indicators engine instead of comparing against a client-supplied price.
    const { data: alerts, error } = await supabaseAdmin
      .from('price_alerts')
      .select('*')
      .eq('symbol', sanitizedSymbol)
      .eq('exchange', exch)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('triggered_at', null)
      .is('indicator', null);

    if (error) {
      console.error('Error fetching alerts:', error);
      throw error;
    }

    const triggeredAlerts = [];

    for (const alert of alerts || []) {
      let triggered = false;

      if (alert.alert_type === 'price_above' && currentPrice >= alert.target_value) {
        triggered = true;
      } else if (alert.alert_type === 'price_below' && currentPrice <= alert.target_value) {
        triggered = true;
      }

      if (triggered) {
        // Mark alert as triggered
        await supabaseAdmin
          .from('price_alerts')
          .update({ triggered_at: new Date().toISOString() })
          .eq('id', alert.id)
          .eq('user_id', userId); // Extra safety: ensure user owns the alert

        // Record a notification so it shows up under the Alerts tab —
        // client code can't insert into notifications directly (RLS), but this
        // function runs with the service role which can.
        const direction = alert.alert_type === 'price_above' ? 'risen above' : 'fallen below';
        const currency = alert.currency ?? 'KES'; // fallback covers rows from before the currency column existed
        await supabaseAdmin.from('notifications').insert({
          user_id: userId,
          type: 'alert',
          feature: 'alerts',
          title: `${alert.symbol} alert triggered`,
          message: `${alert.symbol} has ${direction} ${currency} ${alert.target_value} (now ${currency} ${currentPrice})`,
          action_url: `/stock/${alert.symbol}`,
          entity_id: alert.id,
          entity_type: 'price_alert',
        });

        triggeredAlerts.push(alert);
        console.log('Alert triggered:', alert.id);
      }
    }

    return new Response(JSON.stringify({ 
      checked: alerts?.length || 0,
      triggered: triggeredAlerts.length,
      alerts: triggeredAlerts 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});