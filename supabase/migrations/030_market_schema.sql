-- ═══════════════════════════════════════════════════════════════════════
-- Continua Data — core market schema
-- ═══════════════════════════════════════════════════════════════════════
-- Lives in the SAME Postgres instance as the app (public schema), in its
-- own `market` schema, so there's one project/one connection string, but a
-- clean boundary: the app's tables never migrate through this file, and
-- this backend's tables never migrate through the app's migrations.
--
-- Exchange-agnostic by design: every table keys off `exchange` (text, e.g.
-- 'NSE') and `security_id` (text, e.g. 'NSE:SCOM'), never off anything
-- NSE-specific. Adding NGX/JSE/etc. later is new rows, not new columns.
-- ═══════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS market;

-- ── Reference data ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.exchanges (
  code        text PRIMARY KEY,          -- 'NSE', 'NGX', 'JSE', ...
  name        text NOT NULL,
  country     text NOT NULL,
  currency    text NOT NULL,
  timezone    text NOT NULL,
  mic         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market.sectors (
  id    text PRIMARY KEY,
  name  text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS market.industries (
  id         text PRIMARY KEY,
  sector_id  text NOT NULL REFERENCES market.sectors(id),
  name       text NOT NULL
);

CREATE TABLE IF NOT EXISTS market.companies (
  id            text PRIMARY KEY,        -- 'NSE:company:SCOM'
  name          text NOT NULL,
  description   text,
  sector_id     text REFERENCES market.sectors(id),
  industry_id   text REFERENCES market.industries(id),
  headquarters  text,
  ceo           text,
  employees     text,
  founded       text,
  website       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market.securities (
  id           text PRIMARY KEY,         -- 'NSE:SCOM'
  symbol       text NOT NULL,
  exchange     text NOT NULL,
  company_id   text NOT NULL REFERENCES market.companies(id),
  currency     text NOT NULL,
  status       text NOT NULL CHECK (status IN ('active','suspended','halted','delisted')),
  isin         text,
  listed_at    date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exchange, symbol)
);
CREATE INDEX IF NOT EXISTS idx_securities_exchange ON market.securities(exchange);
CREATE INDEX IF NOT EXISTS idx_securities_company ON market.securities(company_id);

-- ── Live quotes (one row per security — latest tick only) ──────────────

CREATE TABLE IF NOT EXISTS market.live_quotes (
  security_id       text PRIMARY KEY REFERENCES market.securities(id),
  symbol            text NOT NULL,
  exchange          text NOT NULL,
  last_price        numeric NOT NULL,
  open              numeric NOT NULL,
  high              numeric NOT NULL,
  low               numeric NOT NULL,
  previous_close    numeric NOT NULL,
  change            numeric NOT NULL,
  change_percent    numeric NOT NULL,
  volume            bigint NOT NULL DEFAULT 0,
  bid               numeric,
  ask               numeric,
  market_cap        numeric,
  currency          text NOT NULL,
  status            text NOT NULL,
  event_timestamp   timestamptz NOT NULL,
  source            text NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_quotes_exchange ON market.live_quotes(exchange);
CREATE INDEX IF NOT EXISTS idx_live_quotes_change_pct ON market.live_quotes(exchange, change_percent);

-- ── Historical candles (all intervals, one table, partitioned by interval
--    via the composite key rather than physical partitioning — NSE's data
--    volume doesn't justify partitioning yet; revisit if/when it does) ──

CREATE TABLE IF NOT EXISTS market.candles (
  security_id  text NOT NULL REFERENCES market.securities(id),
  interval     text NOT NULL CHECK (interval IN ('1m','5m','15m','1h','1d','1w','1M','1y')),
  bar_time     timestamptz NOT NULL,
  open         numeric NOT NULL,
  high         numeric NOT NULL,
  low          numeric NOT NULL,
  close        numeric NOT NULL,
  volume       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (security_id, interval, bar_time)
);
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON market.candles(security_id, interval, bar_time DESC);

-- ── Fundamentals ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.financial_periods (
  id               text PRIMARY KEY,
  security_id      text NOT NULL REFERENCES market.securities(id),
  period_type      text NOT NULL CHECK (period_type IN ('annual','quarterly')),
  fiscal_year      int NOT NULL,
  fiscal_quarter   int CHECK (fiscal_quarter BETWEEN 1 AND 4),
  period_end       date NOT NULL,
  reported_at      date NOT NULL,
  currency         text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_periods_security ON market.financial_periods(security_id, period_type, fiscal_year DESC);

CREATE TABLE IF NOT EXISTS market.income_statements (
  period_id            text PRIMARY KEY REFERENCES market.financial_periods(id),
  revenue              numeric NOT NULL,
  cost_of_revenue      numeric,
  gross_profit         numeric,
  operating_expenses   numeric,
  operating_income     numeric,
  net_income           numeric NOT NULL,
  eps                  numeric NOT NULL,
  diluted_eps          numeric,
  ebitda               numeric
);

CREATE TABLE IF NOT EXISTS market.balance_sheets (
  period_id             text PRIMARY KEY REFERENCES market.financial_periods(id),
  total_assets          numeric NOT NULL,
  total_liabilities     numeric NOT NULL,
  total_equity          numeric NOT NULL,
  cash                  numeric,
  total_debt            numeric,
  current_assets        numeric,
  current_liabilities   numeric,
  shares_outstanding    numeric
);

CREATE TABLE IF NOT EXISTS market.cash_flow_statements (
  period_id              text PRIMARY KEY REFERENCES market.financial_periods(id),
  operating_cash_flow    numeric NOT NULL,
  investing_cash_flow    numeric,
  financing_cash_flow    numeric,
  free_cash_flow         numeric,
  capex                  numeric
);

CREATE TABLE IF NOT EXISTS market.earnings_events (
  id                 text PRIMARY KEY,
  security_id        text NOT NULL REFERENCES market.securities(id),
  period_id          text REFERENCES market.financial_periods(id),
  fiscal_year        int NOT NULL,
  fiscal_quarter     int,
  expected_date      date,
  reported_date      date,
  eps_estimate       numeric,
  eps_actual         numeric,
  revenue_estimate   numeric,
  revenue_actual     numeric
);
CREATE INDEX IF NOT EXISTS idx_earnings_events_security ON market.earnings_events(security_id, fiscal_year DESC);

CREATE TABLE IF NOT EXISTS market.ownership (
  security_id    text NOT NULL REFERENCES market.securities(id),
  holder_name    text NOT NULL,
  holder_type    text NOT NULL CHECK (holder_type IN ('insider','institution','government','public','other')),
  shares_held    numeric NOT NULL DEFAULT 0,
  percent_held   numeric NOT NULL,
  as_of          timestamptz NOT NULL,
  PRIMARY KEY (security_id, holder_name)
);

-- ── Corporate actions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.corporate_actions (
  id                text PRIMARY KEY,
  security_id       text NOT NULL REFERENCES market.securities(id),
  type              text NOT NULL CHECK (type IN
    ('dividend','split','bonus_issue','rights_issue','buyback','merger','acquisition','suspension','trading_halt')),
  announced_at      date NOT NULL,
  ex_date           date,
  record_date       date,
  pay_date          date,
  effective_date    date,
  status            text NOT NULL CHECK (status IN ('announced','confirmed','completed','cancelled')),
  details           jsonb NOT NULL,       -- discriminated union payload, see types/market.ts CorporateActionDetails
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_security ON market.corporate_actions(security_id, announced_at DESC);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type ON market.corporate_actions(type);

-- ── Computed / derived metrics ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.computed_ratios (
  security_id          text PRIMARY KEY REFERENCES market.securities(id),
  as_of                timestamptz NOT NULL,
  pe                   numeric,
  pb                   numeric,
  ev_ebitda            numeric,
  roe                  numeric,
  roa                  numeric,
  roic                 numeric,
  gross_margin         numeric,
  operating_margin     numeric,
  net_margin           numeric,
  dividend_yield       numeric,
  payout_ratio         numeric,
  current_ratio        numeric,
  debt_to_equity       numeric,
  interest_coverage    numeric,
  price_momentum_3m    numeric,
  volatility_90d       numeric
);

CREATE TABLE IF NOT EXISTS market.afri_scores (
  security_id     text PRIMARY KEY REFERENCES market.securities(id),
  as_of           timestamptz NOT NULL,
  afri_score      numeric NOT NULL,
  afri_value      numeric NOT NULL,
  afri_growth     numeric NOT NULL,
  afri_health     numeric NOT NULL,
  afri_income     numeric NOT NULL,
  afri_risk       numeric NOT NULL,
  afri_quality    numeric NOT NULL,
  afri_momentum   numeric NOT NULL,
  inputs          jsonb NOT NULL          -- snapshot of the raw metrics that produced this score, for auditability
);

-- ── Ingestion audit trail ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.ingestion_logs (
  id             bigserial PRIMARY KEY,
  exchange       text NOT NULL,
  dataset        text NOT NULL CHECK (dataset IN ('price','candle','company','financials','corporate_action','earnings','ownership')),
  status         text NOT NULL CHECK (status IN ('success','partial','failed')),
  record_count   int NOT NULL DEFAULT 0,
  error_count    int NOT NULL DEFAULT 0,
  started_at     timestamptz NOT NULL,
  finished_at    timestamptz NOT NULL,
  errors         jsonb
);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_recent ON market.ingestion_logs(started_at DESC);

-- ── Seed the one active exchange ─────────────────────────────────────────

INSERT INTO market.exchanges (code, name, country, currency, timezone, mic)
VALUES ('NSE', 'Nairobi Securities Exchange', 'Kenya', 'KES', 'Africa/Nairobi', 'XNAI')
ON CONFLICT (code) DO NOTHING;