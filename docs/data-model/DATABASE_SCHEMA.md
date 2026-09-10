# Database Schema

Continua Data lives in a dedicated **`market` schema** inside the same
Postgres database the app already uses via Supabase. DDL is in
`supabase/migrations/030_market_schema.sql`. This doc explains the *why*
behind the tables; the migration file is the source of truth for the exact
columns/types/constraints.

## Design principles

- **Exchange-agnostic keys.** Every table keys off `exchange` (text, e.g.
  `'NSE'`) and natural IDs like `security_id` (text, e.g. `'NSE:SCOM'`) —
  never an NSE-specific field. Adding NGX later is new rows, not new
  columns or new tables.
- **Live vs. historical are separate tables.** `live_quotes` holds exactly
  one row per security — the latest tick. It's small and fast for the
  hottest read path in the app (every stock page, every list view).
  `candles` holds the full history, keyed by `(security_id, interval,
  bar_time)`, and is where charts and momentum/volatility calculations read
  from.
- **Raw and normalized are conceptually separate, physically simple.** The
  spec calls for being able to audit raw vs. normalized data separately.
  In this MVP, `ingestion_logs` carries that audit trail (what ran, when,
  how many records, what errors) without a full raw-payload archive table —
  add one (`market.raw_payloads`, storing the untouched adapter response as
  `jsonb`) if/when audit requirements need the literal raw bytes preserved,
  not just the outcome.
- **Computed data is denormalized into its own tables, not joined on read.**
  `computed_ratios` and `afri_scores` each hold one row per security,
  refreshed by the research engine whenever fundamentals or price change
  meaningfully. This keeps the hot read path (`/research/:symbol`, the
  screener) index-friendly instead of recomputing ratios on every request.

## Table reference

### Reference data
| Table | Purpose |
|---|---|
| `exchanges` | One row per active exchange (`NSE` today). Code, name, country, currency, timezone, MIC. |
| `sectors` / `industries` | Canonical sector/industry taxonomy, shared across exchanges. |
| `companies` | One row per listed company (not per security — relevant if an exchange ever lists multiple share classes for one company). |
| `securities` | One row per tradable ticker. `UNIQUE(exchange, symbol)`. FK to `companies`. |

### Live + historical prices
| Table | Purpose |
|---|---|
| `live_quotes` | One row per security, upserted in place. The "current price everywhere in the app" table. |
| `candles` | `PRIMARY KEY (security_id, interval, bar_time)`. All resolutions (1m through 1y) in one table — see `services/analytics/candleAggregator.ts` for how higher timeframes are derived from daily bars rather than fetched separately. |

### Fundamentals
| Table | Purpose |
|---|---|
| `financial_periods` | One row per (security, period_type, fiscal_year[, fiscal_quarter]). The anchor other fundamentals tables hang off via `period_id`. |
| `income_statements` / `balance_sheets` / `cash_flow_statements` | `period_id PRIMARY KEY` — one-to-one with `financial_periods`. |
| `earnings_events` | Estimate vs. actual EPS/revenue per period, with expected/reported dates — powers earnings calendars. |
| `ownership` | Institutional/insider/government/public holder breakdown, `PRIMARY KEY (security_id, holder_name)`. |

### Corporate actions
| Table | Purpose |
|---|---|
| `corporate_actions` | Dividends, splits, bonus issues, rights issues, buybacks, mergers, acquisitions, suspensions, trading halts. `details` is `jsonb` holding a discriminated-union payload (shape depends on `type` — see `CorporateActionDetails` in `types/market.ts`). |

### Computed / derived
| Table | Purpose |
|---|---|
| `computed_ratios` | PE, PB, EV/EBITDA, ROE, ROA, ROIC, margins, dividend yield, payout ratio, current ratio, debt-to-equity, interest coverage, 3-month momentum, 90-day volatility. One row per security. |
| `afri_scores` | Continua's proprietary composite score + seven sub-scores (Value/Growth/Health/Income/Risk/Quality/Momentum), plus a JSON snapshot of the raw inputs that produced them (`inputs`) for auditability — "why did this stock score 65?" is always answerable. |

### Operational
| Table | Purpose |
|---|---|
| `ingestion_logs` | One row per pipeline run: dataset, status (success/partial/failed), record/error counts, timing, first 20 errors. This is what `docs/architecture/DATA_FLOW.md`'s pipelines all write to — the audit trail the spec asks for. |
| `dead_letters` | One row per record that failed validation or exhausted its retries — full payload + error preserved for manual review, not just a truncated string inside `ingestion_logs.errors`. |
| `api_keys` | API keys for authenticating requests to the REST/WebSocket layer. `key_hash` (SHA-256) only — the plaintext is shown once, at creation time, and never stored. `rate_limit_per_min` lets a given key have its own tier. |

## Indexing notes

- `live_quotes(exchange, change_percent)` — powers the movers (top
  gainers/losers) query directly off the index.
- `candles(security_id, interval, bar_time DESC)` — every chart/history read
  is this exact shape.
- `financial_periods(security_id, period_type, fiscal_year DESC)` — "latest
  annual period for this security" is the single most common fundamentals
  query.
- `corporate_actions(security_id, announced_at DESC)` and a secondary index
  on `type` — dividend history and "all upcoming actions of type X" are
  both common access patterns.

## Migration numbering

The app's existing migrations run `001`–`029` (as of this writing).
Continua Data's schema is `030_market_schema.sql`, with
`031_production_readiness.sql` adding `dead_letters` and `api_keys`.
Continue this numbering for any future changes to the `market` schema so
migration order stays unambiguous across both the app's and this layer's
history.