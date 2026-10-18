# Continua Engine implementation status

## Architecture and language decisions

Permitted sources → existing bounded Python collector → immutable private R2
originals → versioned Python extraction/processing → Supabase
compact `scraping.processed_research` numerical projections and reviewed `market` statements → shared SQL
`market.canonical_financial_history` → existing Go and compatibility API readers
→ stock details, expanded fundamentals and Engine. Frontend financial-history
hooks no longer assemble a separate financial dataset.

Full processed presentations are served from verified private R2 objects;
Supabase retains queryable facts, account/application records and small archive
receipts. Extraction bodies and remaining legacy originals are still moving
through the separately measured migration. Application images use their own
`continua-public-media` bucket and scoped Worker routes.

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
authoritative, dynamically discovered universe. At the foundational verification checkpoint, production coverage had not yet been queried and no live migration was claimed. The live migration measurements below supersede that checkpoint.

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


## Cloudflare migration checkpoint — 2026-10-18

The live registry has **69 active NSE instruments**. A live annual-coverage query
reported 5 complete basic-field observations, 11 partial and 53 discovered with
no usable annual history. This label does not certify the full financial
statement taxonomy, dated valuation eligibility, source licensing or ratings.
It is not a claim that all 69 companies have completed research.

Initial physical inventory: Supabase `scraper-raw` contained 9,150 objects and
3,994,020,859 bytes. Archive metadata contained 13,242 legacy pointers and 475 R2
pointers. Some legacy pointers have no corresponding retained object, including
two NSE PDFs. Missing objects stay explicit, retry with bounded attempts and
quarantine after five failures; verified originals are never invented.

The deployed scraper's `R2_DUAL_WRITE` was found true and corrected to false in
Render, with a successful deployment and persisted-value verification. Both
runtime startup policies now reject duplicate Supabase file writes. The legacy
reader remains solely for verified migration.

`reconcile_cloud.py` automatically scans pending evidence without an issuer
allowlist, processes it with the Python Engine, exports immutable gzip payloads
to `processed/research/...`, and resumes raw/extraction archival. Its SQL receipts
are committed only after R2 size/hash verification. Company-context changes
invalidate prior processed receipts by timestamp. Original archive and prepared
research objects use separate private namespaces in the existing bucket.

A new finite Actions workflow runs every six hours using the existing document
schedule opt-in. User-approved migration limits are 384 MiB/run and 1 GiB/day,
tracked separately from the unchanged normal collection allowance. The existing
Supabase legacy reader credential was configured as an encrypted repository
secret with the user's explicit approval. No secret is committed to the repo.

An initial automatic run processed 2 newly eligible records and verified 75
processed objects, then checkpointed. A subsequent 566-second run processed 25 records, verified 150 additional
processed objects and advanced 30 raw/archive records without failures. These
are checkpoint counts, not final migration totals. Scheduled document runs
now recover missing private issuer evidence. Claim ordering balances completed
financial views across issuers, so the oldest issuer cannot consume every
category before newly discovered issuers advance.

Native Go and compatibility API readers support private processed R2 objects with
checksum, exact issuer/version/status verification, bounded gzip decoding, bounded
caches and deadlines. Current SQL source-permission gates still execute before
object reads. `prefer-r2` is the staged cutover mode; `r2` rejects missing receipts
without silently returning the database projection. Full SQL payload retirement
must wait for every remaining direct reader to be migrated and checked.

A read-only account credential restricted to `continua-financial-documents` was
created with explicit user approval, expires 2027-10-18, and was saved in the Render
backend environment. The native production runtime cutover remains guarded.

Validation at this checkpoint: 422 backend tests passed, 17 skipped; 146 Python
collector tests passed, 6 skipped; all Go packages and vet passed; backend build
and type contracts passed; private-object tests cover corruption, cross-issuer
identity and decompression limits. Live staged reads matched existing responses
for five issuers. Disposable PostgreSQL now passes 40 checks, including actual
Python issuer-fairness claim SQL and checkpoint-table access restrictions.

Still outstanding: deploy this commit and enable the reconciliation workflow;
verify production readers and final object coverage; migrate remaining direct
payload readers and application uploads; retire legacy files only after verified
coverage and explicit deletion approval; finish the rating/forecast/portfolio,
Premium Plus and full mobile/security audits listed above. Storage quota relief
is not yet claimed because the legacy bucket has not been purged.


## Processed-payload retirement

The temporary migration schedule is now explicitly approved and configured to
expire on **2026-11-17**, using `CONTINUA_MIGRATE_LEGACY_UNTIL`. The first remote
Actions migration completed successfully. Production prepared-research endpoints
returned 200 for CGEN and COOP through Cloudflare; Render confirmed the reader
commit live. Verification subsequently counted 499 current processed receipts.

`PROCESSED_PAYLOAD_MODE=r2` enables retirement of bulk SQL presentation payloads
only after an immutable R2 object has been uploaded and read back with matching
size/hash. SQL retains compact queryable financial facts, daily observations,
category/count metadata and migration receipts. Full tables, charts, ownership
and presentation payloads live in R2; the SQL numerical projection is rebuildable.
Source files and extraction text retirement remain a separate migration stage.

A context refresh on a projected row reads its prior verified R2 object, merges
new numerical context, verifies the new immutable object, then commits the SQL
projection and pointer together. Storage failure retains the prior readable
presentation. DB-only maintenance reports pending contexts instead of publishing
a projection with a broken pointer. Internal projections are never returned as
full public research; unavailable storage receives a retryable 503 response.

The finite migration worker uses one SDK upload attempt and durable retries on
later runs. Its transfer reservation matches that actual SDK attempt limit,
without reserving unused immediate upload retries. Normal collection keeps its
previous retry policy and separate allowance. Cancelled SDK copies are drained
before their shared client/budget can be released.

Disposable PostgreSQL passes **48 checks**, including identical canonical
financial responses and coverage reports before/after numerical projection.
Additional tests verify atomic context/pointer updates, restoration of full
presentations, bounded decompression, private-reader requirements, retryable API
failures, cancellation ownership and provider retry-reservation parity.

Live verification of `f7bb1ab` confirmed Render's health revision, HTTP 200
prepared-research responses for CGEN and COOP, and **50 retired presentations
with zero missing/stale current receipts and no bulk presentation fields left
in those SQL rows**. The pass processed five additional observations without
assistant-entered financial values. The full backend suite passed 424 tests;
the collector suite ran 153 tests (six skipped).

## Extraction-version receipt continuity

The migration now records every newly verified extraction snapshot in private
`scraping.extraction_cloud_archive`, indexed by extraction ID and immutable
content hash. One SQL statement commits its receipt only when the raw-artifact
compare-and-set succeeds. The legacy storage path is retained when first moved.
Previously copied snapshots are reverified before being catalogued. The sweep
finds missing receipts across all retained extraction versions, including those
older than the compatibility latest pointer, which never moves backwards.
This enables later private reader migration without losing older version
pointers; it does not authorize removal of originals or SQL extraction bodies.
Disposable PostgreSQL passes **55 checks**, including the actual archive CAS,
concurrent-loser suppression, no-extraction handling and restricted table access.

Archive scheduling also prioritizes already collected primary-source issuer HTML
over the legacy PDF backlog, then issuers with fewer completed financial views.
This removes the PDF-first migration bottleneck without a ticker allowlist or
manual financial entry. Other archive sources remain in the same durable queue.

## Media cutover and missing-source recovery

The approved image migration is live in `51643b4`: all 18 images were verified
through Cloudflare, three profile rows and two post rows switched URLs, and the
18 Supabase image originals were removed after separate explicit approval.
Their source-to-cloud mappings remain in the private migration audit receipt.
No financial original was deleted. Old-client object inserts/updates are now
blocked by a restrictive Storage RLS policy; account and application database
records retain their existing access policies. See `docs/deployment/CLOUDFLARE_MEDIA.md`.

Latest measured processed retirement: **175 rows**, no stale/missing current
R2 receipts, and no bulk presentation fields in those projected rows. The raw
inventory reports **8,687 retained legacy records**, **4,435 records without a
retained Supabase source object**, and **11,857 extraction versions still needing
catalogued snapshots**. These are database-record counts, not unique file counts.
Do not claim archive completion or overall quota compliance from these results.

Migration now skips known-missing legacy source objects using the storage
inventory, reports that gap explicitly, and requeues known completed primary
source jobs through existing automatic recollection. It never marks a missing
source as copied. Remaining archive/recollection counts keep a sweep checkpointed
rather than claiming full completion. Disposable PostgreSQL now passes 64 checks.
