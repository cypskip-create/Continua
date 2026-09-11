-- Makes price/indicator alerts actually fire in the background.
--
-- Until now, nothing ever called check-price-alerts or check-indicator-
-- alerts: both require a signed-in user's session and a price the client
-- already has on screen, and the client never invoked them anyway — so an
-- alert only ever sat in the price_alerts table, never evaluated. This
-- migration schedules the new run-price-alerts edge function (which needs
-- no user session and sweeps every user's active alerts in one pass) to
-- run every 5 minutes via pg_cron + pg_net.
--
-- The shared secret the function checks (ALERTS_CRON_SECRET) is pulled
-- from Supabase Vault at call time rather than hardcoded here, so it never
-- lands in the migration history / git. One-time setup required after this
-- migration runs (see supabase/functions/run-price-alerts/README.md):
--   1. supabase secrets set ALERTS_CRON_SECRET=<a long random value>
--   2. select vault.create_secret('<the same random value>', 'alerts_cron_secret');
-- Until step 2 is done, the cron job's requests will just get a 401 from
-- the function (harmless — no alerts fire until the secret is set).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- run-price-alerts sweeps all active, untriggered alerts in one pass
-- (split into price vs. indicator alerts) — this index matches its price-
-- alert query the same way migration 033's idx_price_alerts_active_indicator
-- already matches its indicator-alert query.
create index if not exists idx_price_alerts_active_price
  on public.price_alerts (exchange, symbol)
  where is_active = true and indicator is null and triggered_at is null;

select
  cron.schedule(
    'run-price-alerts-sweep',
    '*/5 * * * *',
    $$
    select
      net.http_post(
        url := 'https://iqrhndggnbscoypkwrvk.supabase.co/functions/v1/run-price-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_secret'), '')
        ),
        body := jsonb_build_object('trigger', 'pg_cron', 'time', now())
      ) as request_id;
    $$
  )
where not exists (select 1 from cron.job where jobname = 'run-price-alerts-sweep');