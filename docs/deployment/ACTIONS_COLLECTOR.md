# Scheduled collection outside Render

The new Python entrypoint is `scraper-python/scheduled_collect.py`; the workflow
is `.github/workflows/scheduled-collector.yml`. It has no Render URL, API call,
HTTP listener, continuous scheduler, paid AI or Paystack dependency. Go remains
the API/publication target; Python reuses the existing collector, OCR, source
policies, database leases and private R2 drivers. No frontend changes are made.

## Activation and secrets

Four existing credentials are reused as encrypted repository secrets:

- `COLLECTOR_DATABASE_URL` (direct or session-pooler PostgreSQL; not transaction pooling)
- `COLLECTOR_R2_ACCOUNT_ID`
- `COLLECTOR_R2_ACCESS_KEY_ID`
- `COLLECTOR_R2_SECRET_ACCESS_KEY`

No Supabase service-role API token, Paystack key, GitHub administrative token or
public R2 access is needed by the runner. Existing objects/records are retained.
Manual runs default to an offline plan. Explicit `apply=true, maintenance=prepare`
applies only the additive scheduler-state migration. Then `verify-storage` writes
one tiny synthetic private object, checks retrieval/hash and writes one SQL audit
receipt. These must succeed before setting repository variable
`CONTINUA_SCHEDULED_NEWS_ENABLED=true` (news only) or
`CONTINUA_SCHEDULED_DOCUMENTS_ENABLED=true` (documents separately).
The user approved news-only scheduling; document schedules remain off.

Schedules are 00:17/08:17/16:17 UTC for news and 20:43 UTC for documents (03:17,
11:17,19:17 and 23:43 Africa/Nairobi). Only enabled, permission-recorded sources
are considered; at most five sources and two documents per source per run. Runs
rotate sources rather than starting a historical rescrape. The manual `drain`
mode processes durable queues and does not discover new URLs. Non-durable
adapters cannot use drain and report failure rather than pretending to comply.

One workflow concurrency group prevents overlap; a PostgreSQL advisory lock also
guards direct invocations. The ten-minute process deadline is below the fifteen-
minute Actions deadline. Existing document leases and content-addressed R2 writes
allow interrupted work to resume. Failed runs exit nonzero for Actions reporting.

## Bandwidth accounting

32 MiB is reserved durably per run against a shared UTC daily allowance of
128 MiB. Reservations are deliberately not refunded after crashes or partial
failures. These are conservative logical transfer limits, NOT cloud spending caps.
Download and request bytes, browser tunnel directions and R2 verification reads
are counted. R2 uploads reserve four possible payload attempts up front. Database,
TLS framing and SDK headers are excluded. Reads can exceed the logical accounting
boundary by one buffered chunk before the connection is closed. Existing bounded
source retries use exponential backoff; rate, DNS/TLS/robots and source permission
checks stay enforced. No persistent originals are written to the runner filesystem.

Receipts in `scraping.scheduled_runs` record counters, duration, retries, failures,
new artifacts, extracted and skipped records; `scheduled_transfer_days` persists
daily reservations across fresh runners. These tables have RLS enabled and no
public grants. Expired/crashed running receipts remain auditable rather than being
rewritten as successes. Existing R2 hashes, source aliases and extraction versions
remain the deduplication authority. Repeated source downloads/verification still
exist; conditional ETag fetching is not claimed as implemented by this change.

## What is not yet a completed cutover

Hosted checks on 15 October 2026 verified an actual private R2 upload/read-back
and SQL receipt. A bounded Capital Business RSS run discovered ten items, stored
and extracted two, and durably queued the remainder. A two-document NSE queue
drain failed at source fetch; recurring document schedules remain disabled pending document
source verification. No failed run is represented as a successful migration.
A subsequent KenyanStocks drain stored and extracted one real document directly
through private R2 and SQL; its second fetch failed with `SSLError`. Its logical
receipt was approximately 11.8 MB download and 21.7 MB conservative upload
reservation. TLS verification was not disabled to make the remaining fetch pass.

Actions claims stop after five attempts per document; exhausted records stay in
the ledger for operator investigation, not deletion or endless retries. The
legacy backend supports `COLLECTOR_EXECUTION_MODE=actions` to suppress reader-
triggered requests to the suspended scraper while retaining SQL publication.
The default remains `render` until this flag is explicitly configured.
Production Render configuration was left unchanged: applying that flag was
blocked during safety review while document collection remained incomplete.
The old scraper remains suspended; only the separately approved Actions news
schedule is enabled. This is not a completed full native backend cutover.

Keep the old Render scraper suspended until the explicit checks above and a
bounded production collection succeed. Do not resume both schedulers. The main
backend still serves stored records and retains existing payment/access logic.
Existing manual HTTP scrape controls are not yet adapted to Actions dispatch;
do not delete their implementation or claim the dashboard migration is complete.
Continuous quote freshness and authenticated synchronous source-adapter APIs are
not suitable for delayed scheduled Actions and still need a reviewed integration
or dedicated worker. Native extraction alone is not financial publication: the
existing reviewed publication pipeline must ingest the new extraction receipts.

Render showed 5.39 GB service-initiated traffic out of 5.5 GB total at inspection.
That confirms the traffic class, not a measured per-operation attribution. R2
uploads, full read-back verification and SQL/provider calls generate service
traffic; exact proportions were not measured. Moving finite jobs to Actions is
expected to remove their traffic from Render, but no percentage savings has yet
been measured. Actions minutes and R2 requests also have quotas/costs; do not
upgrade plans or enable paid overages under the user's $2 total budget.

GitHub documents that schedules can be delayed or dropped under load, so this
workflow is not a continuous-price feed. See [scheduled workflow limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
