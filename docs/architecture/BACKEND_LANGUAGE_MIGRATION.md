# Full-service source-language migration and release gates

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

## Target boundaries

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
- Full scraper suite with Python extraction enabled: 80 unique tests passed.
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
and primary references for 385 implementation/operator/SQL modules. Regenerate
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

## Primary references

- https://paystack.com/docs/payments/charge-card/
- https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
- https://www.typescriptlang.org/docs/handbook/2/basic-types.html
- https://go.dev/doc/diagnostics
- https://go.dev/doc/effective_go
- https://github.com/jsvine/pdfplumber
