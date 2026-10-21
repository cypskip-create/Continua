# Phase 3: institutional intelligence implementation and validation

## Delivery status

The six systems have executable foundations integrated into Company / Analysis /
My workspace. Their availability depends on the actual input evidence. Phase 3
is **partially complete against the full data acceptance criteria**: the graph
cannot honestly claim a populated, verified production network, and historical
forecast calibration cannot be asserted for missing or current-vintage data.
No synthetic fixture is published as financial evidence.

Python implements the numerical and evidence transformations, SQL enforces
ownership and source eligibility, and Go contains native API implementations.
The existing JavaScript compatibility API remains supported. Production is not
switched to the native candidate. Language decisions and primary documentation
are recorded in `architecture/FEATURE_LANGUAGE_DECISIONS.json`.

## Six connected systems

| System | Implemented behavior | Remaining evidence gate |
| --- | --- | --- |
| Probabilistic forecasting | Target-specific transformations, historical and exponentially weighted residual bootstrap, chronological model comparison, independent audit origins, predictive distributions and uncertainty evidence in Forecast | Enough dated observations and independent audit origins; publication vintages, reviewed action adjustments and trading calendar where needed |
| Monte Carlo and tail risk | Actual owned portfolio inputs, paired/block bootstrap, guarded lognormal alternative, factor bootstrap, deterministic seeds, explicit shocks/cost/rebalance/inflation assumptions, tail attribution and baseline comparison | Complete eligible aligned holding histories; factor paths require sourced matching factor returns and an adequate held-out fit |
| Liquidity | Observed volume/value windows, zero versus missing volume, stale/status checks, hypothetical exit capacity, owned diagnostics and liquidity-constrained optimization using the existing optimizer | Real spread/depth/impact, verified fee/tax schedules and free float remain unavailable unless supplied with evidence |
| Exposure graph | Private literal extraction drafts, immutable source lineage, review, permission-filtered graph queries, accessible interactive graph, paths and explicit hypothetical propagation | Dated, archived, licensed relationships with resolved entity identities must be reviewed before appearing as facts |
| Integrated research | Canonical company overview links existing financials, cash flow, risk, factors, liquidity, valuation, events and ownership readiness; source-linked deterministic observations, scenarios, evidence map, portfolio fit and extended journal | Missing statements/publication dates/relationship evidence remain visible; closed templates do not replace analyst judgment |
| Model governance | Versioned registry, operational receipts, owner-scoped exact input snapshots, deduplicated datasets, source lineage, validation trends, failures, admin review/disable controls | Production empirical accuracy, regime stability and container measurements require ongoing observed evidence |

## Quantitative definitions and checks

Forecast targets distinguish returns, volatility, revenue/earnings growth,
dividend levels and macro levels. Prices are price-only unless verified total
returns are provided. Consecutive fundamental periods and appropriate input
bases are required. Negative/zero denominators do not produce misleading growth.
Observed dates and available dates have different roles: a rolling origin can
use only observations actually available by that origin. Current-vintage macro
history is not backdated into a historical information set.

Up to 60 non-overlapping rolling origins are evaluated. The latest 20 form an
audit holdout excluded from automatic model selection. Selection requires 40
origins and retains the historical baseline unless EW residual bootstrap improves
earlier-origin MAE by 2%. The 80% predictive interval must be compatible with the
audit coverage Wilson 95% interval, with at least 20 audit observations, before
distributions appear. MAE, bias, coverage, regime errors and withholding reasons
remain available. Compatibility is a limited diagnostic, not an accuracy claim.
Each displayed future step is calculated separately; curves are not fabricated
by interpolating a terminal interval. Unsupported advanced models are not
presented as trained models.

Simulation resamples aligned rows together to preserve cross-asset dependence.
Circular blocks preserve ordering within each block. The optional lognormal
method checks marginal normality and discloses the limitations of that check;
its covariance uses 90% sample / 10% spherical shrinkage plus a small jitter.
Factor bootstrap reuses the existing ridge factor model with chronological
two-thirds training / one-third holdout, requires improvement against a training
mean baseline, and separately block-resamples factors and paired residual rows.
It does not interpret factor relationships as causal effects.

Loss is initial capital minus terminal value. VaR is the linear empirical loss
quantile. Expected Shortfall averages the worst `(1-confidence)` fraction with
fractional boundary weighting; fewer than 10 effective tail paths withholds ES.
Cash and security tail contributions reconcile to ES. Initial holding shocks,
rebalance costs, buy-and-hold drift, maximum drawdowns and threshold losses are
included explicitly. Fee-aware rebalancing solves after-fee NAV rather than
creating negative cash. Inflation is an optional constant user assumption with
explicit sessions per year; it is not an automatically sourced CPI projection.

Liquidity windows use 20/60/120 stored observed sessions, not an invented exchange
calendar. Missing volume is not a zero-volume day. Traded value uses an original
value if available or explicitly labels close-times-volume as a proxy. Capacity
requires sufficient volume coverage, positive activity, active status and recent
observations. Participation and liquidation sessions are hypothetical assumptions.
Unavailable spread, tax, fee, depth and impact fields remain missing. Portfolio
constraints compare the existing optimizer with caps from dated holding values
and observed liquidity; infeasible problems return a reason, without fallback
allocations or changing the user's holdings.

Graph Layer A includes only reviewed relationships eligible under current source
permissions and the requested date cutoff. Original cells and conflicting
revisions are retained. Connectivity paths are undirected; documented direction
and relationship semantics remain in the evidence table. Degree is a description
of this incomplete graph, not systemic importance. Layer B uses explicit user
pass-through coefficients along a deterministic first-discovery directed tree,
at most five hops. Cycles are visited once. Ownership percentages never silently
become loss multipliers. Neither layer submits trades.

## Data, storage and ingestion

Existing canonical market history, corporate actions, company financial history,
owned positions, Phase 1 risk inputs and Phase 2 factor/optimization services are
reused. The implementation adds no paid provider or generative AI dependency.
New source fields include effective/available dates, typed from/to identities,
relation type, disclosed percentage/amount/currency, parser version, original
artifact and cell pointers, review status and note. Numerical results carry
model/version, input and data SHA-256 hashes, parameters, seed, calculation time,
cutoff, library versions, dependency versions and source lineage.

`20261022010000_institutional_governance.sql` is an explicit additive maintenance
migration, never an API boot migration. It adds `quantitative_models`,
`quantitative_runs`, `quantitative_datasets`, `quantitative_snapshots` and
`exposure_relationships`, private functions and the source-eligible graph view.
RLS and privilege revocation keep these tables out of direct client access.
Ten saved configurations per owner share deduplicated source datasets. Removing
the last referencing snapshot removes its unused dataset. Operational receipts
retain compact summaries, at most 200 distinct input records per owner and a
90-day window, rather than storing private path arrays in an admin dashboard.

HTML/PDF/CSV/XLSX extraction can stage literal normalized relationship tables.
It does not infer network links from similar company names or prose. All drafts
start pending. Existing legacy shareholder labels lack sufficient dated archived
lineage for automatic promotion. Review also requires enabled sources, recorded
permission, private R2 artifacts, HTTPS original URLs and valid artifact hashes.
Revoked sources disappear from graph queries and saved graph reads.

The scheduled collector gains the manual `prepare-institutional` maintenance
choice. Its news and document cron expressions and enable conditions are
unchanged: `17 */8 * * *` and `43 6,12,20 * * *` respectively.

The explicit live maintenance run
[39674709368](https://github.com/cypskip-create/Continua/actions/runs/39674709368)
completed successfully. It applied the additive schema and found zero eligible
literal extraction batches, zero pending relationships and zero automatically
verified relationships. This confirms the graph population blocker rather than
claiming that an empty network is production relationship coverage. The workflow
remains active and both news/document enable flags were verified `true`.

## API and interface integration

The compatibility router and native Go handlers implement model reads,
company liquidity/forecast preparation, owned simulation/liquidity, verified
graph queries, canonical research profiles, owned snapshots and admin controls.
Generic client calculations cannot authenticate graph relationships. All owned
routes take the verified identity rather than a body/query owner override.
Snapshots are owner-scoped; server-sourced graph saves replace client edge flags
and recheck source eligibility on read. Model disable checks precede cache hits.

Company adds Liquidity and Research case. Forecast retains the existing tool and
adds validation and probability evidence. Analysis adds Monte Carlo and Exposure
Graph. Existing Portfolio and Optimization views share the owned liquidity
component. The existing journal gains assumptions, valuation assumptions and
monitoring-trigger notes; these notes do not create background alerts. The
existing financial admin view gains model controls and relationship review.
Free accounts receive basic liquidity; Premium receives detailed company
liquidity/research and bounded baseline price forecasts; Plus enables portfolio
simulation, graph, advanced assumptions, constraints and model evidence.

## Validation performed locally

- Engine: 166 tests passed, including 26 institutional cases covering independent
  audit origins, availability dates, stale inputs, seeded paths, tail identities,
  paired dependence, costs, factor holdout, liquidity caps, graph provenance and
  cycles, deterministic research and dataset identity.
- Database: 84 fixture checks passed in disposable PGlite, including migrations,
  RLS, immutable source fields, permission revocation, receipt attempts/failures,
  owner isolation, quotas, dataset deduplication/reconstruction and deletion.
- Compatibility API: 479 passed, 18 opt-in tests skipped in the full run; the
  separately enabled real Python calculation suite passed 11 tests.
- Scraper: 193 tests ran, with six real-PostgreSQL cases skipped locally. The CI
  workflow runs those cases against disposable PostgreSQL.
- Frontend: 132 tests passed; production build, 26 edge security checks,
  TypeScript check and browser secret audit passed (172 generated files scanned,
  zero findings). Focused lint on the five new/extended research components
  passed. This is not a claim that unrelated repository-wide lint is clean.
- Go: all packages passed; `go vet ./...` passed. Native candidate CI also retains
  race, real PostgreSQL, restore and parity checks.
- GitHub checks on implementation commit `b7367ae`: CodeQL Advanced, Security
  release checks, API request protection and Native rewrite candidate tests all
  passed. Code scanning reported zero open alerts.
- Browser: synthetic-only result harness inspected at 375px and 595px panel
  widths. Charts/tables/evidence fit their panels, graph entity filtering reduced
  the visible relationship table correctly, and reproducibility disclosures
  rendered. This is not an authenticated production end-to-end test or a claim
  of full desktop/mobile device coverage. The local Vite HMR websocket warning
  is separate from result rendering. The temporary harness is not committed.

Local Windows benchmark (synthetic fixtures only): 70 assets, 1,000 paths and
100 steps took 0.407 seconds in-process; 2 assets, 5,000 paths and 252 steps took
0.150 seconds. Tail attribution residuals were below `1.5e-13` in capital units.
The real isolated worker completed the 70-asset case in 1.085 seconds including
startup. The numerical process peak working set was 71,352,320 bytes. These are
local measurements, not Render container RSS or production latency guarantees.

Per-request limits include 70 assets, 5,000 paths, 252 steps, eight million
asset/path/step operations, stricter matrix work bounds, two MiB JSON input,
one in-flight institutional request per owner and existing global worker
admission/deadline. Results have bounded short-lived caches; path computation
streams asset components rather than retaining asset/path/time cubes. No new
always-on worker, database pool or subscription cost is introduced.

## Remaining limits and Phase 4 priorities

1. Acquire permissioned, archived, dated relationship disclosures and resolve
   typed entity identities; review them before claiming a populated production
   Exposure Graph. Literal-table ingestion is deliberately narrow.
2. Add reviewed exchange calendars and point-in-time corporate-action/total-return
   histories. Current preparation withholds return models across unresolved
   structural actions or long calendar gaps. Stale/incomplete holdings prevent
   a whole-portfolio simulation instead of silently dropping assets.
3. Obtain original publication vintages for fundamental/macro calibration. The
   existing World Bank observations are current-vintage evidence; their presence
   does not establish historical availability or validated forecasts.
4. Add licensed depth/spreads, historical executable volume, fee/tax schedules and
   free float before claiming execution cost or market-impact accuracy.
5. Collect independent forecast outcomes across regimes, monitor calibration and
   compare justified challengers. Model metadata/tests alone do not establish
   investment performance or institutional model approval.
6. Complete authenticated desktop/mobile acceptance on deployment and measure
   total Render container memory/latency under concurrent load. Preserve the
   native-cutover gate until the complete port ledger and recovery checks pass.

No advanced causal macro propagation, guaranteed liquidation, calibrated
production relationship contagion, ARIMA/GARCH model family, or verified
institutional accuracy is claimed by this delivery.

## Dependency follow-up

GitHub exposed four further dependency alerts for `@vitest/mocker` across the
backend and scraper locks during final verification. Both development test
runtimes were updated to exact Vitest 4.1.12, the patched release for the
[manual mock registration](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)
and [Windows redirect traversal](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp)
advisories. Both npm installs reported zero vulnerabilities. The patched backend
suite passed all 479 enabled tests; the scraper's four R2/storage suites passed
15 tests. The complete legacy JavaScript scraper suite subsequently passed all
95 tests using one test worker and the configured Python PDF extraction runtime.
The initial broad run had missing local PDF configuration/concurrency timeouts
and obsolete storage expectations; these were resolved without relaxing runtime
storage protections. Legacy storage expectations now enforce the existing
private-R2-only policy rather than re-enable Supabase artifact writes.
