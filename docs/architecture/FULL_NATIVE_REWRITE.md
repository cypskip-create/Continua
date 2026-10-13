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
Billing helper ports preserve prices, mobile-number normalization and exact-byte
HMAC verification. They do NOT yet implement charge execution or atomic access
activation. Direct card collection remains prohibited by the existing PCI gate.

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

## Reproducible candidate checks

Go: `go -C backend-go test ./...` with `NATIVE_PYTHON_BIN` set for real
Go/Python integration. Python: `python -m unittest discover -s engine-python/tests`
and `python -m unittest discover -s scraper-python/tests`.
`node infra/migration/native-engine-parity.mjs` uses `NATIVE_PYTHON_BIN`.
Regenerate the ledger with `node infra/migration/build-native-ledger.mjs`.
`node infra/migration/check-native-cutover.mjs` is expected to fail until the full
rewrite and declared release gates actually pass.
