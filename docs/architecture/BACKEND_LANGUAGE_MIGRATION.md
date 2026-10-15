# Full-service source-language migration and release gates

## Current requested native rewrite — 15 October 2026

The active target is **Go backend orchestration and Python Engine/collector**,
with retained SQL guarantees and provider-native Supabase JavaScript entrypoints.
The JavaScript release described below is the historical compatibility reference
and rollback, not completion of the user's full native migration.

`NATIVE_REWRITE_LEDGER.json` is the exhaustive release checklist. Pending and
partial entries still block production. The candidate never forwards to Node;
local tests do use the original implementation as a behavior oracle. Publication,
news repair and durable research refresh workers now have native implementations
and explicit candidate wiring, but are off by default and require the reviewed
outbox SQL migration before activation. Real concurrency/recovery, full API and
Render-equivalent resource tests remain outstanding. Do not delete rollback code
or treat a source-code commit as a production cutover. The user subsequently
authorized major checks followed by commit/push on 15 October; see
`NATIVE_IMPLEMENTATION_CONTINUATION.md` for current delivery status.

Local candidate additions on 14 October include all six admin review routes,
review-only comparative drafts, announcement assembly, Test Mode-only billing
startup/webhook/optional renewal wiring, historical backtest and volume-profile
calculations, parameterized screening, authenticated bounded WebSockets and
transactional monitor notification delivery. The research/draft comparison runner
passes 29 fixture-only comparisons, in addition to the earlier numerical suites.
Quote WebSocket production now follows persisted native quote writes; corporate-action
production still needs wiring. The new monitor needs
owned-database and recovery checks. None of these additions is a production
deployment or evidence that every remaining ledger feature is complete.

Single-column admin confirmation now requires explicit `unitsVerified`,
`columnIndex`, `sourcePage` and a reviewed note, using the atomic historical
publication validator. It does not preserve the unsafe legacy behavior of
writing an unbalanced statement anyway. Admin caller integration with these
required evidence fields is a release gate. The native candidate rejects live
billing configuration and excludes the live key entirely; no real charges were
made during these tests.

Further local native additions cover private forecast notebook ownership,
account/revision limits and immutable deadline-based resolutions; 23 notebook
reference fixtures pass. Market breadth and six advanced research models pass
17 reference fixtures including a 1,000-path, 252-session bootstrap. The advanced
worker uses a serial eight-MiB input profile with the existing shared process
admission/deadline, not a new service. Workbench history, financial-version and
owner-scoped manual monitoring checks are also wired. These remain candidate
features: owned-database, large-notebook capacity, integration, actual collector
and Linux/hosted recovery/resource gates still block a full cutover.

Latest local checks: all Go packages pass, 86 Python Engine tests,
88 collector tests, 16 deterministic answer comparisons, 52 collector parser reference comparisons, 39 feed mapper
comparisons, 38 registered-report comparisons, 23 notebook, 17 advanced/market,
12 bond/futures schema/calculation and 10 edge tests pass. The selected four
rollback storage suites pass 13 tests. These counts describe different suites,
not one exhaustive production test. The owned-database read comparison retry
failed during the legacy security-news query with a terminated connection; its
full gate remains failed, and completed checks are now printed safely on failure.

Two concurrent secret-free maximum-bootstrap fixtures on Windows each used
about 35.5 MB sampled peak resident memory and completed in about 0.77 seconds.
`infra/migration/native-resource-probe.py` records actual platform/process metrics
without network access or secrets. This does not measure combined Go/collector/
Chromium, so it does not approve Render cutover.

Separate isolated Linux checks on 15 October passed all twelve compiled Go fixture packages with
real Python worker integration, external networking disabled, non-root execution,
read-only source mounts, 512 MiB memory and no swap. Latest cgroup peak was 62,644,224
bytes with zero OOM events. Dedicated real-Redis and PostgreSQL fixtures are explicitly reported
as separate by the network-isolated Linux runner; Redis previously passed locally against disposable
Redis 8.2.10, including TTL expiry and server-side oversized-value rejection.
Neither dedicated networked fixture is silently counted as executed by that container.
The Engine's 86-test suite also passed in a separate Linux fixture. These are fixture checks,
not full collector/Chromium, provider, restart or production-load validation.
The native earnings-sensitivity route now checks entitlement and sourced annual
EPS available on the quote date; future and mock quotes remain rejected.

Native Go ingestion additions include atomic bounded candle chunks, transactional
index writes, unchanged-payload suppression and permission-locked index history.
The official index extraction reader preserves publisher observation dates and
rejects unknown codes and future observations. Candidate enrichment schedules
publish existing collector observations only; they do not replace all remaining
external transport adapters. All Go tests and vet pass after these additions.
SQL integration, collector wiring and recovery still require validation.

Streaming fanout now has a global four-MiB queued-byte budget in addition to
client/message limits. Canonical quote writes reject missing volume, future
timestamps and duplicate identities; an older or identical payload does not
replace the live row or produce a claimed new delivery. Permission/schema-gated
MyStocks extraction-to-quote publication and atomic research-refresh outbox wiring
now exist; actual provider/SQL/recovery and complete source coverage remain unfinished.
Reviewed publication also rejects inconsistent zero-asset
or negative-asset statements, while preserving legitimately negative equity.

See `docs/deployment/BANDWIDTH_AND_STORAGE.md` for the latest R2-only persistence
and bandwidth changes. The reported Render suspension is a bandwidth issue; it
does not establish a storage failure or justify enabling paid hosting.

The native cache now supports bounded Go Redis and Upstash clients as explicit
alternatives to memory. Family generation invalidation, coalesced operations,
late-load isolation, private-key exclusion and dated last-good research retention
have fixtures. No paid cache account was enabled. Optional AI remains disabled.

Native portfolio workspace/stress, source-cited deterministic answers, disabled-AI
usage accounting and pipeline health are wired behind the existing owner/plan
checks. Large portfolio IPC and bootstrap fixtures passed separately under 512 MiB;
these do not measure combined browser/collector/API load.

Native operator migration planning, selected guarded validate/apply workflows and
explicit data API-key create/revoke commands now have Go implementations and
SQL-driver fixtures. A dedicated PostgreSQL 17.11 test now passes outbox migration
rollback/apply/retry/private grants, quote deduplication/atomic failure and
canonical millisecond precision, plus synthetic API-key create/auth/revoke.
Other operator workflows, full-schema concurrency and recovery tests remain required;
unregistered migration workflows fail closed. See
`docs/deployment/NATIVE_OPERATOR_TOOLS.md`.

MyStocks permission is explicitly confirmed. Separate native quote and durable
history-session collectors preserve private evidence and close-only semantics;
rounded source volume is not fabricated into an exact count. Live history/schema
verification and a canonical close-only publication model remain gates. See
`docs/deployment/MYSTOCKS_NATIVE_COLLECTION.md`.

The native browser boundary now uses one shared 50-MiB transfer budget for an
entire page, rather than granting each asset connection a separate allowance;
fixture coverage checks all tunnels/directions share the budget. Matching Chrome
and ChromeDriver 155.0.8059.79 start successfully with a fresh profile and
secret-free child environment. A real source probe exposed intercepted clicks;
scrolling controls clear of the sticky layout fixed it. All five COOP financial
categories now pass through the isolated worker, with category verification and
table extraction. A separate history probe returned 2,940 rows from the requested
2015 window. The package-safe subprocess entrypoint also has a real dependency
import regression test, preventing the collector's html.py from shadowing the
standard library. No sandbox, TLS, robots or source-domain guard was disabled.
These public read-only probes made no database/R2 writes; all-issuer coverage,
private storage/publication, Linux Chromium and restart/load gates remain open.

All eight COOP top-level views rendered through the isolated native worker,
including all five financial subcategories. The Files parser discovered 23
approved-domain PDF links without downloading them. A second issuer, ABSA,
also passed financial-category extraction (43 rows). These are spot coverage
checks, not an assertion that every issuer/report has been collected or published.

Deeper PostgreSQL tests exposed and fixed cross-statement review leakage. Reads
now require the latest review for each statement component to match its actual
values, including null/missing optional fields. A balance review cannot authorize
income or cash flow; a later unreviewed edit cannot inherit an older review.
Actual tests cover progressive component reviews, earnings isolation, missing
EPS/CFO, unchanged audit suppression and full component/audit rollback.

Persisted research now carries a native methodology/evidence marker. Freshness
checks bind the paired ratios/score, quote timestamp/price, filing-review and
canonical-audit versions, and pending refresh state. Legacy/unmarked records,
mixed 7.73/13.96 PE pairs and out-of-band edits with an unchanged quote are
rejected as current. The numerical fingerprint normalizes insignificant
IEEE/NUMERIC transport noise to 15 significant digits; it does not alter displayed
ratio values. Native recomputation is required, not a fabricated replacement.

AFX quote candidates retain their observed trading date and unavailable fields;
no fetch-time substitution, guessed volume or invented OHLC is used. Profile,
quote and history parsing share one DOM, tested without redundant parses. These
candidates remain unreviewed and are not a new live quote feed.

## Historical JavaScript compatibility release

All backend/Engine and scraper implementation source and operator scripts have
been migrated to plain JavaScript for Node.js. Python workers provide document
extraction and selectable numerical labs. There are no TypeScript implementation
files under either service's `src` or `scripts`; `.d.ts` files are development-only
contracts. Existing business rules were preserved, not reinvented.
This is NOT a full Go/Python replacement or a claim that a language conversion
alone fixes runtime failures. Node was already the runtime before this migration.
No live billing is enabled by this release.

## Evidence before language choice

The backend Docker image executes `node dist/index.js`: TypeScript is compiled
before deployment, not interpreted on each request. API, streaming, ingestion,
renewals and research share one process; the database pool has ten connections.
Several enrichment jobs previously started together on every cold boot.
This establishes contention risks, not the cause of every reported outage.
Private runtime diagnostics now measure event-loop p99, utilization, memory and
database waiters. Production logs must establish which resource is exhausted.

## Historical release boundaries (superseded by the native target above)

- API/streaming/auth/billing: Node.js/plain JavaScript retains the existing
  supported libraries and authenticated contracts. A new Go compatibility proxy
  would add another process on a 512MB host without proving a bottleneck is fixed,
  so Go is not introduced in this release. Consider a measured Go port only if
  runtime profiling and load tests justify that cost.
- Python: document parsing and numerical research where its libraries fit.
  Portfolio stress, bond risk, futures risk and earnings-sensitivity labs now
  have isolated Python implementations and authenticated route integration.
  Set `ENGINE_CALCULATION_RUNTIME=python` to select them; `node` is the rollback
  default. Differential tests execute both runtimes and compare numbers,
  nulls, response structure and methodology. The subprocess gets no database,
  payment or provider secrets, accepts bounded input, has two concurrent slots
  and a five-second deadline. Other Engine modules are migrated to JavaScript;
  they are not Python implementations.
  The isolated pdfplumber worker is implemented and fixture-tested. It has
  bounded input/pages/output, a process deadline and Linux memory/CPU limits.
  Its financial tables remain heuristic and require validation. Poppler is the
  current default; set `PDF_NATIVE_ENGINE=python` only in a validation rollout.
- Node: Playwright browser collection is an appropriate existing integration.
  It need not be rewritten merely to change the source language. Preserve source
  permission, robots, bounded navigation, queue leases and stored provenance.

## Feature-preservation inventory

Run `node scripts/exportMigrationInventory.js` in backend to print the full
backend/scraper source inventory, exported functions and literal route surfaces.
This uses the existing compiler AST; it is read-only and never reads secrets.
Static inventory is not proof of semantic parity. It includes dynamic mounts as
unresolved entries which must be reviewed, not silently discarded.

All API families must remain: quotes, history, companies, financial statements,
corporate actions, announcements, news, movers, sectors, research, screening,
instruments, indices, indicators, backtests, volume profiles, valuations,
Engine/workbench/notebooks/market research, billing, health and private admin.
Include WebSockets, all ingestion/publication/scheduled workers, every Engine
calculation, source adapters, financial-validation mappings and private storage.
TradersHub/user ownership in Supabase and application-side APIs are also part
of end-to-end compatibility, even where they are outside these services.

## Cutover gates for every service

1. Golden API envelopes, empty/null semantics, errors and authorization match.
2. Financial calculations match dated/currency/unit-aware golden fixtures;
   missing data remains missing. Python/Go numerical differences require review.
3. Payment amount/owner/mode checks, signed raw-body webhooks, atomic fulfillment,
   idempotency, consent and renewal cancellation/replay remain intact.
4. Queue claims/retries, dead letters, adapter permission and artifact hashes match.
5. Test concurrency and restart/recovery on a Render-equivalent resource budget.
6. Parallel validation, bounded rollback and migration/schema compatibility pass
   before switching production. No new paid infrastructure without approval.

## Card collection decision

User confirmed there is not yet PCI-DSS/Paystack approval for direct card
collection. Retain the supported secure card interface; do not add ordinary
card/CVV/PIN fields or hide a hosted iframe inside an accordion. The direct
API can also require bank-controlled authentication, so never promise that all
cards can avoid external bank UI.

## Local validation

- Full backend suite with real Python differential tests: 411 passed, 6 skipped.
- Backend and scraper builds passed.
- Full scraper suite with Python extraction enabled: 83 unique tests passed
  after the R2 archive/memory follow-up (80 at the initial migration).
  The config excludes stale `dist` test artifacts; previous runs included two
  duplicate compiled tests. Original tests are retained.
- Frontend/Edge compatibility suite: 107 passed.
- Static route/middleware preservation: 130 original calls across all 255 source
  modules preserved. 245 backend and 59 scraper implementation/CLI files converted.
- Python PDF financial-row and sequential-document fixtures passed; broader
  source/layout comparison and Render memory/latency benchmarks are still needed.
- Local Docker daemon was unavailable; hosted Render Docker builds and post-deploy
  checks must be verified before reporting successful deployment.
- Separate liveness probes expose the deployed revision without DB work. Existing
  data-readiness probes remain intact. Free Render sleep/cold starts remain a
  hosting limitation, not something a source-language conversion can eliminate.

## Hosted verification — 13 October 2026

Migration release `9d3d80336916216366e33d159ff69fc4d66bc14b` is Live on both
Render services, confirmed by the dashboards AND revision-bearing liveness
responses. Backend runtime is Node v24.21.0; scraper runtime is v24.20.0.
Backend readiness returned HTTP 200/healthy and scraper readiness 200/ok.
All seven read-only smoke checks passed, including three requested NSE quotes
through the Cloudflare preview, scraper-private-origin denial and billing
ownership denial. Vercel's commit status also reported success.

The quote smoke check must supply `symbols=SCOM,KCB,EQTY`; omitting that required
parameter correctly returns 400 and is not a backend migration defect.
No live payment, membership change, credential change or paid-hosting activation
was performed. Python options remain behind their explicit runtime settings;
successful installation/fixture parity is not a production load benchmark.
Automated parity and read-only smoke checks do not prove every external feed,
bank/OTP path or missing financial year is complete.

## Complete feature-language inventory and Edge boundaries

`FEATURE_LANGUAGE_DECISIONS.json` records language, runtime, workload rationale
and primary references for the implementation/operator/SQL modules. Regenerate
with `node infra/migration/feature-language-decisions.mjs`. Classification is a
workload/integration review, not an individual performance benchmark or a claim
that one language is universally fastest. Repository `AGENTS.md` records the
user's requirement to research language suitability before future implementation.

All seven Supabase Edge entrypoints are now JavaScript with explicit `entrypoint`
configuration. Deno declaration files remain development-only. Existing explicit
JWT and cron authorization checks remain; account deletion and alert delivery
are never exercised with production user credentials by migration smoke tests.
Legacy AI functions reject missing sessions before processing and remain disabled
unless `CONTINUA_LEGACY_AI_ENABLED=true` is explicitly configured. No funded AI
service is activated. The retired mock subscription upgrade still returns 410.

All seven Edge functions were deployed and confirmed ACTIVE with `index.js`
entrypoints. Six unauthenticated POST checks returned 401, and the retired mock
upgrade returned 410. No production account, alert or AI-provider write was made.

## Primary references

### Native validation follow-up — 15 October 2026

The complete Go test suite and Go vet pass locally; the Python collector suite
passes 88 tests. The disposable PostgreSQL fixture also passes real migration,
financial review isolation, audit receipt, paired research provenance and source
quote attribution/order tests. Its container is removed after each run. Tests
reject malformed/future quote timestamps and wrong-ticker evidence while allowing
a retained actual-URL alias for identical bytes shared by separate issuers.
These results do not constitute full migration, hosted verification or cutover.

- https://paystack.com/docs/payments/charge-card/
- https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
- https://www.typescriptlang.org/docs/handbook/2/basic-types.html
- https://go.dev/doc/diagnostics
- https://go.dev/doc/effective_go
- https://github.com/jsvine/pdfplumber
