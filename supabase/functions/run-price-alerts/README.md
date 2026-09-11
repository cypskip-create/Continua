# run-price-alerts

Scheduled sweep that evaluates every user's active price/indicator alerts
and creates a notification for any that trigger. Runs every 5 minutes via
pg_cron (see `supabase/migrations/20260911184206_schedule_alert_sweeps.sql`)
— it needs no signed-in user, so alerts fire whether or not anyone has the
app open.

## One-time setup (required for the cron job to actually call this function)

The cron job authenticates with a shared secret rather than a user JWT.
Pick one long random value and set it in **both** places:

1. As the function's own secret:
   ```
   supabase secrets set ALERTS_CRON_SECRET=<your-long-random-value>
   ```
2. In Supabase Vault, under the exact name the migration looks up
   (`alerts_cron_secret`), via the SQL editor:
   ```sql
   select vault.create_secret('<the same random value>', 'alerts_cron_secret');
   ```

Until step 2 is done, pg_cron's requests reach the function but get a 401
(harmless — no alerts fire, nothing else breaks). Also requires
`CONTINUA_DATA_BASE_URL` and `CONTINUA_DATA_API_KEY` to already be set as
function secrets (same ones `check-indicator-alerts` uses) so this function
can fetch live quotes/indicators server-side.

## Why this exists instead of reusing check-price-alerts / check-indicator-alerts

Those two functions require a signed-in user's JWT and a price the client
already has on screen — they were built for a "check right now, for the
stock I'm looking at" flow that the client never actually calls. This
function is account-agnostic: it queries `price_alerts` directly for every
active, untriggered row across all users, batches live-quote/indicator
lookups per exchange, and evaluates everything in one pass.