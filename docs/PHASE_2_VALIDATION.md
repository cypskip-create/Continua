# Continua investment intelligence: implementation and validation

## Delivered behavior

The existing Company / Analysis / My workspace structure now includes Macro,
Factors, Optimization, Backtesting and Events. Events replaces the Ask Engine
navigation entry. No paid generative API, always-on service, trade execution or
native production cutover is enabled.

Python contains the deterministic models shared by the deployed compatibility
API and native Go candidate. SQL retains ownership, revision and permission
guarantees. The language rationale and primary references are recorded in
`architecture/FEATURE_LANGUAGE_DECISIONS.json`.

- Macro evidence separates observation date, first available date and retrieval.
  Historical queries select only revisions available at the cutoff. Missing
  periods are not interpolated. Basic current Macro and Events are free;
  detailed evidence requires Premium; model workspaces require Plus.
- Factor descriptors use actual reported financial inputs and sourced prices.
  Cross-sectional normalization requires sufficient comparable peers. Return
  factor models use a chronological training/holdout split, ridge regression,
  factor covariance and diagonal residual variance. Descriptors are not betas.
- Allocation uses SciPy HiGHS feasibility and SLSQP for minimum variance, risk
  parity and maximum diversification. It supports holding/sector limits,
  exclusions, turnover and optional cash. Owned allocation inputs are loaded
  server-side. Infeasible or unsuccessful solutions are withheld.
- Basket replay uses strict common raw-price sessions, explicit corporate
  actions, fractional shares, cash, dividends receivable, payment dates,
  proportional costs and monthly/quarterly rebalancing. It exports equity,
  drawdowns, annual observed returns, trades, holdings and reconciled P&L.
  Benchmark/risk-free metrics require compatible explicit evidence. Private
  named simulations never modify real holdings and are capped at 25/account.
- Events provides company/type/date/held/watchlist filters, original sources
  and separate announcement/effective dates. Notifications require explicit
  opt-in, global notification permission and Plus; delivery is atomic and
  deduplicated. Retrospective event summaries require sufficient non-overlapping
  observations and make no causal or predictive claim.
- Collection adds conditional HTTP validators, literal bounded CSV/XLSX
  extraction, official macro discovery and review-only industry fields.
  PDF/OCR, private R2 evidence, checkpoints, transfer budgets, source rights and
  canonical financial review remain in force. Coverage includes all registered
  securities, including suspended/delisted records; registration is not a claim
  that every historical filing or action has been acquired.

## Sources and publication boundaries

World Bank WDI: annual Kenya GDP growth, consumer-price inflation, official
exchange-rate average and reserves. Its API and published data terms permit the
reviewed source configuration. A historical observation fetched today is a
first-seen vintage today, not proof that this revision was known in its year.

Primary references:

- https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api
- https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
- https://data.worldbank.org/summary-terms-of-use
- https://www.centralbank.go.ke/monthly-economic-indicators/
- https://www.centralbank.go.ke/inflation-rates/
- https://www.centralbank.go.ke/monetary-policy/
- https://www.centralbank.go.ke/releases/weekly-bulletin/
- https://www.knbs.or.ke/reports_category/cpi-and-inflation-rates/
- https://www.knbs.or.ke/reports_category/quarterly-gdp-reports/
- https://annualreport.cma.or.ke/
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize.html

CBK and KNBS sources are private evidence collection configurations. Their
publication permission is unknown, so they cannot silently enter public
research. CBK literal dated rate extraction requires review. CMA's public
company archive was investigated; public accessibility was not treated as a
blanket commercial redistribution licence or authorization for mass crawling.
No paid IMF/Treasury data licence is assumed.

Industry/segment extraction preserves raw cells, units, currency, period,
statement basis and provenance. Banking and insurance labels require explicit
industry metadata. Conflicts and missing units are withheld for review. An
extracted draft is never automatic canonical publication authorization.

## Expanded panel repairs

Shared expanded financial panels now show actual period inputs, provenance,
availability dates and precise missing reasons. Financial statement Learn More
uses the selected company/period rather than generic-only explanations.
Company evidence, reliability, recommendations, portfolio and publisher tables
now expose explicit unavailable states instead of disappearing. Earnings no
longer displays a currency symbol before the report count.

The generated `PHASE_2_PANEL_INVENTORY.md` lists expansion entrypoints for
review. Existing chart/model components retain their financial evidence gates.

## Database and rollout

`supabase/migrations/20261021150000_investment_evidence.sql` is additive and
idempotent. The explicit `prepare-investment` scheduled-collector maintenance
action applies it and registers only missing source configurations, preserving
operator disables and source permissions. API boot never applies this schema.
Source revocation takes effect at read time. Revisions are append-only; only
verification status can change. Simulations/preferences are owner scoped.

The native Go service remains a candidate. This change does not satisfy or
bypass the separate exhaustive production cutover requirements in AGENTS.md.

## Scheduled collection repair

The news failure was an article HTTP access failure despite usable public RSS
summary evidence. Only actual summaries are retained for permitted 403/404/410
article responses, with feed provenance; rate limits, server errors and missing
summaries still fail. Successful verification: run 39612690078.

The document failure was the collector's intentional run deadline being
reported as a failure. Planned budget stops now preserve resumable checkpoints
and partial counters; preceding real source failures still fail the run.
Successful verification: run 39614765180. Source time slices prevent one source
from consuming the whole run. No transfer budget was increased.

Both cron expressions are preserved: `17 */8 * * *` and `43 6,12,20 * * *`
(GitHub schedules use UTC). The workflow and both enable variables were active
when inspected. Runner/action updates remove the reported Node 20 and moving
Ubuntu runner warnings for this workflow.

## Validation and practical limits

The embedded PostgreSQL fixture applies the actual migration twice and passed
43 checks covering source revocation, vintages, reviewed report publication,
owner isolation, RLS, quotas, immutable corrections and notification deduplication.
Engine tests passed 140 cases. Final frontend, backend, native scraper and Go
results are recorded in the release verification below.

A synthetic 70-asset / 261-return local worker benchmark completed minimum
variance in 1.262s, risk parity in 0.253s and maximum diversification in 0.353s.
The Windows worker peak was about 73 MiB; the real secret-free worker round trip
was 1.799s. This is local evidence, not a claim of production memory certification.

Complete historical constituents, delisting proceeds, suspensions, adjusted
total-return indexes and point-in-time fundamental strategy inputs are not
invented. Unsupported strategy templates remain unavailable until those inputs
are verified. Imported snapshots are structure/numerically validated, not
independently authenticated. Cash scenarios are explicit direct exposures, not
stock-price predictions. Old archived artifacts require explicit reprocessing
if their original collection did not parse them.

## Release verification

Local final checks: production build and 26 edge security tests passed; browser
artifact secret audit found zero findings across 171 files; frontend 131 tests
passed; compatibility backend 462 passed with 18 opt-in/database skips, followed
by all 12 opt-in Python worker parity tests passing; Engine 140 tests passed;
native scraper 188 tests ran successfully with six external PostgreSQL fixture
skips; native Go packages passed. The CI job exercises those PostgreSQL fixtures
against its disposable service. Source audit inventoried 66 expansion entrypoints.
An unauthenticated browser correctly redirected protected Engine navigation to
sign-in; this is not an authenticated end-to-end UI certification.

Security patches include Vite 8.3.5 in all three lockfiles, Pillow 13.0.0,
certifi 2026.10.19, and Go 1.27.3. CI identified the newly published
GO-2026-6809 in Go 1.27.2; both go.mod and the verified official Docker digest
were updated. See https://go.dev/dl/ and
https://pkg.go.dev/vuln/GO-2026-6809 . No alerts were dismissed or scanners disabled.
