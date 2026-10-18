# Continua Engine implementation status

## Architecture and language decisions

Permitted sources → existing bounded Python collector → immutable private R2
originals → versioned Python extraction/processing → Supabase
`scraping.processed_research` and reviewed `market` statements → shared SQL
`market.canonical_financial_history` → existing Go and compatibility API readers
→ stock details, expanded fundamentals and Engine. Frontend financial-history
hooks no longer assemble a separate financial dataset.

SQL owns read reconciliation and current permission checks; Python remains the
financial processing/calculation runtime; Go remains the native API runtime.
Existing compatibility readers are repaired without switching production runtimes.
No new paid service, AI provider or always-on worker is enabled.

## Completed in this change

- Identified the browser-only publisher fallback versus reviewed-only Engine
  read split. Moved history/latest reads to the same backend function.
- Preserve reviewed-component identity checks, missing values and source rights.
  Publisher observations retain unknown filing dates, period ends and currency.
- Reconcile rounded summary versus statement observations; conflicting
  equal-priority amounts become null with evidence retained. Reviewed periods
  have priority. Source permission revocation is checked on every database read.
- Separate available financial observations from point-in-time eligibility.
- Version financial/Engine caches to avoid retaining the old incompatible model.
- Remove financial-page requests that trigger scraper work; scheduled discovery
  and processing remain the existing collection mechanism.
- Evidence checks expose calculation inputs, missing fields, periods and methods;
  industrial cash/leverage/liquidity checks are inapplicable to financial firms.

## Migration and rollout

Apply existing scraper foundation, processed-research, statement-candidate,
filing-history review and partial-statement migrations first, then
`supabase/migrations/20261018100000_canonical_financial_observations.sql`.
Deploy API readers after the migration. Functions are invoker-security and
execution is revoked from PUBLIC, anon and authenticated. Use the existing
private backend database role with table privileges; grant these function
signatures explicitly if that role is not their owner. No financial rows are
deleted or rewritten. Rollback code before removing the additive functions.

## Jobs and operations

The existing scheduled collector discovers the NSE universe from
`market.securities`, uses bounded transfer budgets, job leases, retries,
`FOR UPDATE SKIP LOCKED`, and versioned processing receipts. Existing Actions
workflow: `.github/workflows/scheduled-collector.yml`.
Processing: `python scraper-python/scheduled_collect.py --kind documents --apply
--maintenance process-research` with the documented collector environment.

## Protection, atomicity and operations

Native Go API reuses configured Redis/Upstash connections for atomic fixed-window
counters. Counters hash identities/resources, expire automatically, have bounded
request deadlines and fail closed with 503 when the configured store fails.
Single-process memory mode retains a bounded map. Verified identity/key limits
remain separate from pre-auth IP limits. Additional native workload ceilings per
minute: research resource 30, calculation writes 20, billing 20, transfers 5,
other mutations 30. 429 responses include Retry-After and RATE_LIMITED. Existing
proxy trust, owner/entitlement checks, signed billing and body limits are retained.
The compatibility API now also limits unverified public requests; health probes
and separately signature-verified webhooks remain outside that limiter. The Go
rewrite remains gated from production; this is not a claim of full production
security cutover or complete coverage of Supabase Auth endpoints.

Compatibility statement bundles now use one transaction, an issuer lock, component
period checks and a reviewed-statement overwrite guard. Parser exceptions have
sanitized durable dead-letter receipts, exponential retry delays and a five-attempt
quarantine, so one issuer cannot poison a batch. Existing dead-letter uniqueness
migration is required. Administrative DB-only coverage/retry CLI:
`python scraper-python/research_status.py [--ticker CGEN] [--retry-failed]`.
Retry requires an explicit ticker. It does not modify financial values.

## Methods and product scope

Canonical read model: `canonical-financials-v1`.
Evidence readiness: `nse-research-2026-10-v2`.
Financial evidence checks: `financial-evidence-v2`.
Existing Continua valuation-star, AfriScore and scenario methods have not yet
received the comprehensive replacement/validation requested in the brief.
No new Premium Plus tools are claimed in this stage. Rating growth inputs now
use the same eligible dated filing history as valuation ratios; undated amounts
remain visible but cannot contaminate those inputs. EV/EBITDA requires actual
cash and debt; missing earnings no longer derive zero EPS.

## Validation and production status

Disposable embedded PostgreSQL fixture: 36 checks passed across six synthetic
company cases (CGEN, COOP, SCOM, KCB, BRIT, KUKZ). Includes the requested CGEN
amounts as test inputs, not verified production observations. Run with
`node infra/migration/canonical-financial-fixture.mjs`; isolated test-only
dependency installation is documented in the script.
Validation completed:
- Backend: 417 passed, 17 skipped; frontend: 115 passed.
- Python Engine: 113 passed; scraper: 141 tests, 6 skipped.
- All Go packages passed with real Python worker fixtures; `go vet ./...` passed.
- Six native/compatibility bundle parity cases passed, including undated data.
- Frontend production build and TypeScript contract checks passed.
- Backend and frontend-workspace production dependency audits: 0 vulnerabilities.
- Dedicated networked PostgreSQL/Redis production integrations and mobile visual
  checks were not performed. Embedded PostgreSQL verifies the migration itself.

Local frontend reference registry: **57 tickers**. The live database is the
authoritative, dynamically discovered universe. Production NSE registry count: **not queried**. Production completed/partial/failed
counts: **not measured**. Production tickers backfilled by this session: **0**.
No production database/R2 credentials are configured in the execution environment.
No migration or deployment success is claimed.

## Deployment configuration still required

Private `DATABASE_URL` and R2 configuration (`R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RAW_STORAGE_DRIVER=r2`) are required
for live collection. The existing Actions workflow reads the corresponding
`COLLECTOR_DATABASE_URL` and `COLLECTOR_R2_*` secrets. Its scheduled collection
requires `CONTINUA_SCHEDULED_DOCUMENTS_ENABLED=true` (and the news counterpart
where desired), recorded per-source permissions and `COLLECTOR_PROCESS_RESEARCH`.
Redis/Upstash protection uses the existing CACHE_DRIVER and REDIS_URL or
UPSTASH_REDIS_REST_URL/TOKEN configuration. No provider credentials belong in Git.

## Remaining work and constraints

- Production configuration/migration, live registry coverage and universe backfill.
- Full rating methodology, forecast/scenario and transaction-ledger audit.
- Complete production-wide rate-limit/security/observability audit, including
  compatibility-runtime distributed limits and external Auth service policies.
- Remaining Premium Plus tools and full application/mobile expanded-detail audit.
- Per-metric supplementation of partially reviewed periods is intentionally not
  performed: unverified amounts must not inherit a reviewed period's filing date.
- Unknown currencies, filing dates and fiscal period ends limit dated calculations;
  source licensing must be recorded before previously blocked data is published.
- API caches retain existing short TTLs; source-rights changes are immediate at
  database reads but may persist until an already cached API response expires.
