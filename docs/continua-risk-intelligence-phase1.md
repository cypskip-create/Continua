# Continua Risk Intelligence — Phase 1

## Implementation plan and architecture

1. Inspect the existing Engine, owned portfolio reads, numerical ports, entitlements, exports and canonical price/action repositories.
2. Reuse those inputs and add one authoritative Python risk model with explicit quality and observation requirements.
3. Add overview, volatility attribution, pairwise correlation, stress and manual reallocation using that model.
4. Connect Analysis, Engine Portfolio and the existing investment portfolio analysis view without changing their navigation hierarchy.
5. Fix the thirteen reported CodeQL alerts, then verify numerical, authorization, regression and production builds.

The existing compatibility API remains deployed; this change does **not** cut production over to the native rewrite. Both adapters use the same Python calculation module. No new always-on service, paid AI configuration or financial-data pipeline is introduced.

The feature uses Python for the Engine workload and Go for candidate HTTP/owner/entitlement enforcement. Python's standard [statistics library](https://docs.python.org/3/library/statistics.html) supplies sample covariance, standard deviation and Pearson correlation without another numerical dependency. Go retains [parameterized database access](https://go.dev/doc/database/querying). The decision is recorded in `architecture/FEATURE_LANGUAGE_DECISIONS.json`.

## Existing components inspected and retained

- Engine Company / Analysis / My workspace groups; stock Fundamentals and Evidence; portfolio holdings, cash-flow and snapshot views.
- `public.portfolios` owned holdings aggregated by symbol, recorded cost and share counts. Snapshot and external cash-flow records remain distinct from current-holdings simulations.
- Canonical candles, permitted publisher daily observations, quotes, company/sector registry and corporate-action repositories.
- Existing portfolio exposures, price-return analytics, risk attribution, deterministic labs, native Python worker and optional-storage outage handling.
- Supabase authorization and subscription checks, shared Redis/Upstash/memory caching, existing research snapshot export.
- Existing Premium company research, Free authenticated basic portfolio overview and Premium Plus personal workspace access.

## Authoritative services

- `backend/python/continua_risk.py`: data preparation, exposures, covariance, contributions, correlations, evidence, stock price diagnostics, replay and simulations. Packaged by the **existing** backend Dockerfile's Python directory copy.
- `engine-python/continua_engine/risk_intelligence.py`: native adapter to that same module. Native portfolio exposure helpers also delegate to the canonical implementation.
- `backend/src/services/research/stockRisk.js`: canonical price/action reads, public issuer-history cache, stock research adapter.
- `engineWorkspace.js` and native `portfolio_workspace.py`: append the risk snapshot to the existing owned portfolio response. Legacy portfolio-risk response fields project the same snapshot rather than running another model.
- `backend-go/internal/httpapi/stock_risk.go` and `risk_labs.go`: candidate stock and simulation routes; authenticated owner is selected on the server.

The old index-aligned browser risk hook was removed. Portfolio Analysis now displays server calculations and no longer uses its separate heuristic risk score. Historical reference calculations remain for compatibility/differential tests, but the active portfolio response uses the canonical model.

## Models and evidence

- Long-only value weights: position market value / covered value. Account value and cash balances are not invented.
- Simple observed price returns keyed by **both** interval endpoints. No forward fill, missing-as-zero returns or positional array matching.
- Pairwise Pearson correlations use their own exact overlapping intervals, with configurable minimum 20–250 observations. Constant series produce unavailable correlations. Rolling correlations use 60 paired returns, sampled every 20.
- Covariance uses one common sample and sample denominator `n−1`, requiring at least `max(minimum, holding count + 2)` returns. No matrix inversion or optimal-allocation claim is made.
- Portfolio variance `wᵀΣw`; daily standard deviation `sqrt(wᵀΣw)`; marginal contribution `(Σw)i / σ`; component contribution `wi × marginal`; percentage contribution `component / σ × 100`.
- Negative contributions are retained. Contributions reconcile to daily volatility within `10⁻⁸` percentage points. Sector contributions aggregate these same components.
- Diversification ratio compares weighted standalone volatility with portfolio volatility. It is a historical diagnostic.
- Drawdown uses a wealth curve initialized at 100. The portfolio curve is explicitly a current-holdings, daily-rebalanced simulation. Gaps beyond four calendar days are omitted and disclosed; the curve is not realized account performance.
- Downside deviation uses `sqrt(mean(min(return, 0)²))`, with zero as its disclosed target. Stock volatility and downside deviation are daily figures.
- Existing historical one-day 95% VaR and expected-shortfall fields are retained on the canonical sample when there are at least 60 returns; they are not maximum losses or forecasts.
- Each snapshot records calculation time, market-data time, quote sessions, sample dates, observation counts, sources, methodology version, every holding's inclusion/exclusion, observed latest volume and fraction of unchanged closes.

Annual volatility is deliberately **unavailable** without a verified NSE session calendar. This avoids silently multiplying sparse observations by `sqrt(252)`. Verified benchmark beta/correlation and sector-relative stock estimates also remain unavailable when matching benchmark/peer data is absent. The legacy basket beta is explicitly identified as an equal-weight holdings proxy, never an NSE index.

Known unverified splits and bonus issues exclude the affected history. Raw price returns exclude dividends. Quote and history staleness, missing prices, mixed currencies and insufficient observations are explicit. Highly repeated closes downgrade coverage quality; they are not evidence of low economic risk.

## Scenario and reallocation API

- `GET /api/v1/engine/portfolio?exchange=NSE`: existing Premium Plus response, including `riskIntelligence` and its evidence.
- `GET /api/v1/engine/risk/:symbol`: Premium or Premium Plus stock risk without requiring ownership of the stock.
- `POST /api/v1/engine/labs/intelligence`: Premium Plus only; loads the verified user's portfolio snapshot before applying assumptions.

Simulation inputs can contain every covered holding's proposed decimal weight, optional cash weight, maximum holding/sector weights, and a scenario. Weights including cash must sum to 1 within `10⁻⁸`; negative weights and leverage are rejected. Exposure comparisons remain usable when covariance coverage is insufficient; proposed volatility is withheld if any positive allocation lacks coverage.

The deterministic overlap rule is **holding > top-five > sector > market**. Exactly one return shock applies to each holding. Cash has zero modeled shock and no invented yield. Scenario P/L is `sum(value × shock)`. Returned scenario definitions and research exports can be reused; this phase does not add a saved-scenario database.

Replay definitions are generated from actual contiguous 20-return observed windows: the weakest covered window and the latest available window, deduplicated. Replay requires complete covered-holding history. Dates and constituent shocks are retained; no named crises or historical market moves are fabricated. Replay cannot be combined with custom shocks.

Neither simulation route writes holdings or places orders. Reallocation is transparent manual reweighting, with no expected-return or optimization model.

The pre-existing Risk lab retains its documented multiplicative market-plus-sector scenario convention for API compatibility. Risk Intelligence's new scenario API uses the explicit overriding convention above; the two contracts are visibly distinguished.

## Frontend and access

`RiskIntelligence.tsx` provides Overview, Risk Drivers, Correlations, Stress Lab, Reallocation and Evidence. It is embedded in:

- Engine → Analysis → Risk Intelligence;
- Engine → My workspace → Portfolio;
- Investment portfolio → Analysis.

Premium sees independent stock diagnostics; Premium Plus also sees the portfolio workbench. Backend checks enforce both tiers. The Free authenticated overview remains available. Existing paid company research stays accessible.

The heatmap scrolls on narrow screens and supports pair inspection with dates/counts. Inputs are labeled, results include methodology, edits clear previous simulation results, and reset restores current weights. Evidence and simulation snapshots use the existing export infrastructure.

## Performance and caching

- The arbitrary ten-holding risk/history cap is removed in both adapters. Every holding receives a coverage record, including failed or timed-out history loads.
- Compatibility history reads run in bounded batches of four with an eight-second enrichment budget. History cache uses security ID and quote revision for 30 seconds; later corrections without a quote revision expire within that TTL.
- Compatibility risk cache keys include owner, exchange, methodology namespace and a digest of exact holdings/quotes/history. Owned result caching uses the existing LRU dependency with coalesced loads, 32 entries / 8 MiB and a 30-second TTL; public history uses the existing shared cache driver.
- Native research keeps its two-request admission budget and serial reads. Its result cache is bounded to 32 entries / 8 MiB, keyed by owner, exchange and owned position snapshot, with a 30-second correction TTL.
- Python input/output, process concurrency and calculation deadlines remain bounded. Risk requests have a 2 MiB input ceiling and a 4 MiB risk output ceiling (ordinary calculators retain 1 MiB). Capacity failures are explicit; no holding is silently dropped to fit a numerical cap.
- HTTP edge caches remain excluded from personal risk routes. Subscription verification is never served from the risk-result cache.

## Security alert remediation

| Alert | Remediation |
| --- | --- |
| 17 | Go credential cache fingerprint uses process-keyed HMAC; stored API-key verification remains scrypt-compatible. |
| 16, 15 | Financial review defaults use `jsonb_build_object` rather than quoting serialized JSON into SQL. |
| 14 | Screener direction selects fixed `ASC` / `DESC` literals; sort columns remain allowlisted and filter values parameterized. |
| 11, 10 | Test assertions match URL structure instead of substring-based host checks. |
| 9, 7 | Operator/admin key comparisons use bounded padded buffers and constant-time equality, without fast password hashes. |
| 8 | Compatibility credential-cache keys use the existing asynchronous scrypt derivation, with two active derivations and a bounded 32-request queue; stored database hashes are unchanged. |
| 6 | Company Engine bundles use memory query caching; the hook no longer persists authentication-tainted responses in localStorage. |
| 5 | Webhook route explicitly attaches `express-rate-limit` with the existing bounded/shared store. |
| 4, 3 | Billing routes explicitly apply admission limiting before authentication. Shared-store outages still fail closed with 503. |

No alert is dismissed or scanning rule disabled as a substitute for fixing it. GitHub must finish analyzing the pushed commit before final alert closure can be confirmed.

## Validation and operational limits

The numerical tests cover weights, expected sample volatility, negative contribution reconciliation, missing-date alignment, stale/unpriced/action-blocked holdings, more than ten holdings, deterministic shock precedence, unchanged real portfolios, cash, allocation constraints, unsupported covariance and actual replay windows. HTTP tests exercise verified ownership and tier gates.

Local checks include Python unit tests, real Python/compatibility parity tests, backend and frontend regression tests, native Go tests, TypeScript checks, JavaScript build validation, production Vite build and browser-secret audit. The mobile visual fixture is explicitly synthetic test data and is not a product route or market-data source.

The repository-wide lint baseline has hundreds of unrelated existing findings. Changed-file lint has no errors; an existing Engine effect dependency warning remains. See the final delivery message for executed test counts and GitHub scanning status.

No database migration is needed. No new infrastructure, orders, real charges or enabled paid AI services are part of this change.

Remaining data-dependent work: verified NSE session calendar and matching benchmarks; complete licensed adjusted total-return histories and suspension metadata; validated sector-relative comparisons; synchronized historical valuation for mixed-date quotes. This phase does not claim institutional-grade accuracy, guarantee an improved allocation, or implement future optimization, Monte Carlo, multi-asset or forecasting phases.

### Executed local verification

- Python: 121 tests passed.
- Compatibility backend: 474 tests passed, 6 skipped, including the real shared risk worker, cache owner isolation and bounded scrypt verification queue.
- Frontend: 128 tests passed.
- Native Go: all packages passed; marketdata, HTTP and Engine suites rechecked after final integration changes.
- Edge/security: 26 tests passed; browser artifact audit returned zero findings.
- Scraper operator-key tests: 2 passed. The broader scraper suite had 89 passes and 6 failures in PDF extraction/timing and obsolete private Supabase archive expectations; those paths were not changed or weakened to make the suite green.
- Both TypeScript checks, backend JavaScript build and frontend production build passed. Changed-file lint had zero errors and one existing Engine effect warning; repository-wide lint remains non-green.
- Mobile browser QA at 390 × 844 verified overview, negative risk contribution display, pair details and reallocation controls using an explicitly labeled synthetic fixture.
- A local synthetic 70-holding / 261-return workload took 2.349 seconds, with 1,256,228 input bytes and 2,229,685 output bytes. This verifies the configured transport budgets on this machine; it is not a production latency or memory guarantee.
