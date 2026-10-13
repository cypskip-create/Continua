# Full native backend, Engine and scraper rewrite — in progress

This is a different task from the completed TypeScript-to-JavaScript source
migration. It replaces application runtimes and business implementations. It is
not complete, not deployed as the replacement, and not a Node-forwarding facade.
Do not begin the later frontend work or claim full completion at this checkpoint.

## Researched language boundaries

- Go: bounded HTTP/database services, API-key authentication, user verification,
  entitlements, billing, WebSockets, source ingestion/publication and schedulers.
  Native HTTP/cancellation and a compiled binary are appropriate tools, not proof
  of faster behavior. Source concurrency, database pressure and memory still need
  actual profiling. Native candidate currently binds only 127.0.0.1:4080.
- Python: evidence-aware Engine calculations, research assembly and scraper
  discovery/extraction. Existing Python PDF/lab implementations can be reused.
  Playwright Python still runs Chromium; changing its controller language cannot
  by itself eliminate browser memory. Keep one heavy job at a time and verify
  real process/container usage before changing Render.
- SQL: retain database constraints, RLS, queue claims and atomic fulfillments.
- Supabase Edge: retain provider-compatible Deno JavaScript, rather than inventing
  unsupported Go/Python deployment there. These entrypoints require end-to-end
  compatibility validation when their downstream services switch.

The exhaustive `NATIVE_REWRITE_LEDGER.json` records every legacy source feature
and every static route/mount. Pending or partial entries are intentional release
blockers, not missing work disguised as success. Source-module counts are not a
percentage of completed engineering. Development-only JS oracle scripts/tests
do not constitute production Node forwarding.

## First native implementations

`backend-go/` contains native Go API-key scrypt lookup, bounded fingerprint cache,
usage touch, origin policy, bounded rate-limit identities, database quote reads,
quote routes, sectors and liveness. Native readiness remains 503; production
startup is blocked while other routes/worker/billing capabilities are missing.
Billing now has native Go provider execution, durable account-locked checkout
reservations, strict agreements, mobile-money/card initialization, receipt
verification, legacy-order recovery and optional encrypted-token enrollment.
Live activation calls the retained atomic SQL fulfillment function; Test Mode
can only record a sandbox receipt, never change membership. Signed raw-body
webhooks reverify provider transactions instead of trusting event-supplied data.
Account HTTP handlers delegate only after both API-key and Supabase identity
verification. A ten-minute Go renewal scheduler uses durable reservations and
verifies ambiguous existing references instead of charging again.

These billing components are not activated by candidate startup, deployed, or
tested against real Paystack in this checkpoint. They were tested with SQL and
HTTP/provider mocks only. Actual provider sandbox, concurrent-host/restart and
complete differential/hosted integration tests remain release blockers. Direct
card collection remains prohibited by the existing PCI gate.

`engine-python/` contains native SMA, EMA, Wilder RSI, MACD, crossover, financial
ratios, YoY, point-in-time annual ratios, reported ratios, portfolio composition,
dated performance/correlation, dividend windows, monitoring and opt-in learning
calculation ports. Existing four Python numerical
labs are reused through the bounded worker protocol. Numerical/key/null/warmup
compatibility is checked against the existing pure JS functions, including
negative earnings and unavailable/future filings. The Go worker launches Python
without inherited database/payment/provider secrets and bounds concurrency,
input/output and total queue/execution time.

127 native-vs-reference calculation cases passed. Native Go tests cover API-key
hash compatibility/revocation, verified user identity, Premium/Plus boundaries,
origin policy, bounded rate limits, quote wire shapes and unavailable routes,
exact-byte signed webhooks, trusted receipt amounts/owners/modes, monthly expiry
clamping, provider-token encryption/tampering and real Go-to-Python execution.
Python unit suites passed 8 Engine and 9 scraper tests. These are candidate
checks, not full-feature release approval or a production load benchmark.

The real Go executable also passed loopback-only smoke checks using the owned
database: three requested NSE quotes and seven sectors returned from native
SQL reads; missing-key access returned 401 and incomplete readiness returned
503. The native instrument route also returned the database's 69 non-delisted
instruments, without relying on a hardcoded ticker list. The candidate was
stopped afterward. No provider request, account mutation,
native production deploy or frontend migration occurred.

`scraper-python/` contains source-permission/domain/robots policy, pinned public
DNS and TLS, response framing/size limits, streaming artifact download, native
private R2 file upload and streaming checksum verification. Original rollback
copy is mandatory when configured. Publisher adapters, Playwright tab traversal,
queue/database operator APIs, extraction review/publication and schedules still
need full native ports and integration tests; this is not a deployed collector.

## Remaining release sequence

1. Complete native Go API/config/storage/auth/entitlement parity, every route.
2. Complete billing/Test Mode/webhook/renewal/recovery without live charges.
3. Complete all Python Engine evidence/workspaces/monitoring/preferences/tools.
4. Complete Go feeds/publication/realtime/background workers and operator scripts.
5. Complete Python source adapters, browser collection, extraction/mappings,
   historical backfill, durable queues, R2 migration and scraper operator APIs.
6. Run full golden suites, concurrency/restart/cancellation/recovery and actual
   512MB-compatible resource tests. Update ledger using evidence, not checkboxes.
7. Only then stage native hosted validation, cut over and retire old runtime
   implementations. Keep the currently deployed services functioning throughout.

No live charge, funded AI, paid always-on host, DNS cutover or production-native
switch is authorized merely by writing a new implementation. Existing constraints
and the user's earlier approvals remain in force.

## Primary references consulted 13 October 2026

- https://pkg.go.dev/net/http
- https://go.dev/doc/gc-guide
- https://docs.python.org/3/library/asyncio.html
- https://playwright.dev/python/docs/intro
- https://docs.aws.amazon.com/boto3/latest/reference/services/s3.html
- https://developers.cloudflare.com/r2/api/s3/api/
- https://docs.python.org/3/library/asyncio-stream.html
- https://go.dev/doc/database/cancel-operations
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/webhooks/

## Billing continuation checkpoint

The Go billing suites cover concurrent/repeated taps, different-intent recovery,
reservation rollback, verified ownership, server-owned amounts, mode/currency/
metadata mismatch, Test Mode isolation, inline declines, optional reusable-token
enrollment, fixed provider origin/no redirects/bounded response/no retries,
webhook signatures/mode/verification retry, legacy live recovery, recorded policy,
and renewal cancellation/locking/rollback/unknown outcomes. SQL mocks validate
statement arguments and transaction ordering, not actual PostgreSQL concurrency.
The old runtime and development TypeScript contracts/tests are retained until
the exhaustive native release gates pass. No production cleanup or cutover has
occurred merely because the candidate compiles.

Continuation validation: 67 Go test functions pass; `go vet` and the executable
build pass. The 127-case Python calculation comparison and 8 Engine/9 scraper
unit tests pass. Scraper tests required temporary-file access on Windows; the
initial restricted run stalled and was stopped after the permitted rerun passed.
Read-only native loopback database smoke checks still pass. The full cutover
gate deliberately fails: 300 source features remain pending/partial and all 132
route/mount entries still require exhaustive verification. These are release
blockers, not a claim that the whole application has passed.

## Market, preferences and durable collector continuation

Native Go now serves indices, company profiles, daily/coarse history, sparklines,
range performance, latest/historical reviewed financials and publisher financial
tables. Reads preserve missing/null states, actual publisher dates, nonfuture
filing dates and review/source/permission gates. Weekly/monthly/yearly bars are
rebuilt by Python from daily source bars, with Monday/calendar alignment and
honest provenance. A bounded 4MB/5000-entry LRU coalesces loads; account/billing
verification is never cached. Reader refresh callbacks exist but their native
collector/publication integration is still pending.

28 real owned-database read comparisons passed against existing repository
contracts for COOP, KCB and SCOM. This includes an expected COOP latest-financial
404: compatibility does not mean missing reviewed coverage has been created.
No canonical financial rows were added or fabricated during this validation.

Preference schema/defaults, explicit opt-in daily learning and recommendations
now execute in Python. Go persists settings under the existing per-account
advisory lock, preserves server interests from stale forms, and implements
Plus-protected preference/interests/recommendation routes. Ownership, consent,
reset and rollback tests use mocks; no real user preferences were changed.

The native Python collector now also has bounded PostgreSQL access, durable
document job enqueue/claim/requeue/attempt-token finish, source permission/config
repositories, incremental crawl checkpoints, a bounded serial heavy-work queue,
and atomic artifact attribution/immutable extraction version repositories.
Native crawl updates use a last-seen lease CAS; discovery preserves active lease
timestamps, so an expired worker cannot overwrite a newer claim. This protection
still requires full crawler/restart integration tests before cutover.

KenyanStocks tab/category plans passed six reference comparisons and accept new
observed tabs rather than imposing a fixed tab ceiling. Credential-bearing URLs
are rejected. Source adapters, browser navigation, complete extraction mappings,
review/publication, private storage reads/backfill/operator APIs and scheduling
still require migration and whole-pipeline tests. The native collector has not
been activated on Render.

Pinned Psycopg 3.3.6, psycopg-pool 3.3.3 and boto3 1.43.97 dependencies are
installed in an ignored isolated workspace environment, with a resolved
`scraper-python/requirements-lock.txt`. The actual SDK supports conditional
streaming R2 upload/checksum verification in an intercepted test; no real R2
upload occurred. Native PostgreSQL connected to the owned database inside a
read-only transaction (36 enabled sources, 13,408 artifacts, 11,566 extraction
versions at the check). No document jobs or source settings were mutated.

Go uses pgx's safely parameter-encoded simple protocol and Python disables
automatic prepared statements, avoiding session-prepared-state assumptions in
Supavisor transaction pooling. Owned read comparisons passed after this change.

Current continuation checks: 92 Go test functions, static checks and executable
build; 177 numerical/schema reference cases; 17 Python Engine tests; 26 native
scraper tests including installed SDKs; six tab-plan comparisons and the real
read-only database checks. These are component checks, not full migration,
hosted provider sandbox, concurrent-process recovery or 512MB load approval.
Unnecessary TypeScript cleanup remains gated on the genuinely complete native
migration; the working old implementation and its test contracts stay intact.

Additional primary references:

- https://www.psycopg.org/psycopg3/docs/advanced/pool.html
- https://www.psycopg.org/psycopg3/docs/advanced/async.html
- https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
- https://pkg.go.dev/github.com/jackc/pgx/v5
- https://pypi.org/project/psycopg/3.3.6/
- https://pypi.org/project/psycopg-pool/3.3.3/
- https://pypi.org/project/boto3/1.43.97/

## Reproducible candidate checks

Go: `go -C backend-go test ./...` with `NATIVE_PYTHON_BIN` set for real
Go/Python integration. Python: `python -m unittest discover -s engine-python/tests`
and `python -m unittest discover -s scraper-python/tests`.
`node infra/migration/native-engine-parity.mjs` uses `NATIVE_PYTHON_BIN`.
Regenerate the ledger with `node infra/migration/build-native-ledger.mjs`.
`node infra/migration/check-native-cutover.mjs` is expected to fail until the full
rewrite and declared release gates actually pass.
