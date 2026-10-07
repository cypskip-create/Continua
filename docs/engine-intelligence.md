# Engine intelligence

Engine combines dated company filings, company-linked news, valuation models,
ownership disclosures and technical history. It adds financial quality checks,
cash conversion, dilution, illustrative revenue scenarios, changes since earlier
observations, comparable-sector peers, private portfolio research and monitoring.
Missing feeds and stale observations are shown explicitly. Research preferences
follow the account; learning company interests requires an explicit opt-in.

## Deployment

Apply `supabase/migrations/20261007200000_engine_intelligence.sql` after existing
migrations. It creates account-owned preferences and cash flows plus private
server tables for observations, monitoring, portfolio snapshots and AI usage.
The backend database role must have access to these tables and bypass their RLS;
client roles cannot access server tables. Missing tables return a migration-needed
error instead of pretending preferences or monitoring were saved.

Set `OPENAI_API_KEY` in backend environment configuration only. Local development
loads `backend/.env.local` before `.env`; neither belongs in source control. The
frontend must never receive the key. API billing is separate from a ChatGPT plan.
An exhausted-credit response requires the project owner to enable API billing.

| Setting | Default | Purpose |
| --- | --- | --- |
| `ENGINE_AI_MONTHLY_BUDGET_USD` | `5` | Shared application monthly reservation cap; `0` disables paid requests |
| `ENGINE_AI_USER_DAILY_LIMIT` | `20` | Daily requests per paid user, additionally limited to five per hour |
| `ENGINE_MONITOR_ENABLED` | `true` | Evaluate enabled research rules every 30 minutes |

The assistant runs only after an explicit question. It uses `gpt-5.4-mini`, a
bounded evidence context, a 1,200-token response budget, structured output and
validated evidence IDs. Identical requests are cached for ten minutes within the
same user. Persistent, transaction-locked conservative reservations prevent
concurrent requests exceeding the application cap. Failed and timed-out requests
retain reservations because a provider may already have processed them. This cap
does not cover other applications using the key or unrelated data-provider fees.

Calculated analysis, extractive news summaries and monitoring use no AI tokens.
Monitoring remains quiet at baseline and on unchanged observations; thresholds
notify on crossings, with per-rule idempotent notification delivery. Users can
pause rules or disable Engine notifications in preferences.

## Interpretation and coverage

Portfolio value requires one currency; missing prices produce partial-coverage
warnings. Performance requires complete dated snapshots and entered external
flows. Time-weighted returns use an end-of-period flow convention; money-weighted
returns use entered flow dates and are annualized. These are returns of recorded
invested holdings, excluding unrecorded cash, dividends and brokerage activity.
Current holdings do not reconstruct historical ownership or broker total return.
Correlations require at least 20 identical common-date return intervals and are
excluded where disclosed splits/bonus issues have an unverified adjustment basis.

Backtests execute completed-bar signals at the next session's open, apply fees
and slippage, constrain order size by session volume and mark open positions to
market. They include a chronological 70/30 evaluation split and remain historical
simulations, excluding dividends, taxes and order-book execution.

Illustrative scenarios are assumptions, not forecasts. Shareholder changes are
disclosed ownership differences, not evidence of purchases. Debt maturity,
segment detail, management guidance, verified analyst consensus and historical
index benchmark attribution require additional data feeds; unavailable coverage
is not filled with generated figures. This release does not claim full moomoo
data or execution parity.
