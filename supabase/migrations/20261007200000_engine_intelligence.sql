-- Engine state is separate from market-data cache and never exposed across users.
CREATE TABLE IF NOT EXISTS public.engine_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.engine_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_preferences_owner ON public.engine_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engine_preferences TO authenticated;

CREATE TABLE IF NOT EXISTS market.engine_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  security_id text NOT NULL REFERENCES market.securities(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (security_id, fingerprint)
);
CREATE INDEX engine_snapshots_recent ON market.engine_snapshots(security_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS market.engine_monitor_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  symbol text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('material_change','price_below','price_above','debt_above','revenue_growth_below')),
  threshold numeric,
  enabled boolean NOT NULL DEFAULT true,
  last_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exchange, symbol, kind),
  CHECK (kind = 'material_change' OR threshold IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS market.engine_monitor_deliveries (
  rule_id uuid NOT NULL REFERENCES market.engine_monitor_rules(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(rule_id,event_key)
);
CREATE TABLE IF NOT EXISTS market.engine_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL,
  reserved_usd numeric NOT NULL CHECK (reserved_usd >= 0),
  input_tokens integer,
  output_tokens integer,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX engine_ai_usage_period ON market.engine_ai_usage(created_at,user_id);
CREATE TABLE IF NOT EXISTS market.engine_portfolio_snapshots (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  currency text NOT NULL,
  session_date date NOT NULL,
  total_value numeric NOT NULL,
  holdings jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,exchange,session_date)
);
-- Private server-owned records. Only the verified backend user boundary reads/writes these.
ALTER TABLE market.engine_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE market.engine_monitor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE market.engine_monitor_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE market.engine_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE market.engine_portfolio_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.engine_snapshots,market.engine_monitor_rules,market.engine_monitor_deliveries,
  market.engine_ai_usage,market.engine_portfolio_snapshots FROM anon,authenticated;

CREATE TABLE IF NOT EXISTS public.engine_cash_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  session_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount <> 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.engine_cash_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_cash_flows_owner ON public.engine_cash_flows
  FOR ALL TO authenticated USING(auth.uid() = user_id) WITH CHECK(auth.uid() = user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.engine_cash_flows TO authenticated;

GRANT ALL ON public.engine_preferences,public.engine_cash_flows,market.engine_snapshots,
  market.engine_monitor_rules,market.engine_monitor_deliveries,market.engine_ai_usage,
  market.engine_portfolio_snapshots TO service_role;
GRANT USAGE,SELECT ON SEQUENCE market.engine_snapshots_id_seq TO service_role;
