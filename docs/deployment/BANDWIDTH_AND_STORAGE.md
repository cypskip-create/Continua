# Continua persistence and transfer policy — 14 October 2026

The current user authorization permits direct commits/pushes to main, private R2
migration and deletion of reverified legacy originals. No paid hosting, keepalive
or native production cutover has been activated.

## Current verified position

- Supabase Storage: 443 raw originals removed after verification, freeing
  485,260,917 bytes; 8,707 objects / 3,508,759,942 bytes remain in scraper-raw.
  The 90 previously uncatalogued originals (15,786,092 bytes) are all preserved
  privately in R2 and their Supabase originals are removed with SQL receipts.
- The finite migration's 1 GiB/day allowance is nearly exhausted today. Its
  separate durable ledger reserved 1,072,134,648 bytes on 19 October. Do not
  bypass this limit; the approved six-hour schedule resumes when quota permits.
  Automatic migration expires 17 November; ordinary Engine processing continues.
- The latest automatic Engine run archived 350 prepared objects and 70
  raw/extraction records, with zero failures. Coverage uses the active 69-stock
  registry; this receipt is not proof that all issuer evidence is complete.
- Render scraper stores new files only in R2 and has no Supabase file credentials.
  Application images use the separate private media bucket. Database/Auth remain
  on Supabase. The live backend and sampled prepared-data routes returned 200.
- Native Go/Python implementation and tests are pushed, including private owned
  R2 read verification and index-only workload guards. Production still uses
  the compatibility runtime. Partial ledger entries and full release gates remain.

The sections below retain the earlier bandwidth rationale and fixture scope;
references to the earlier suspension or undeployed candidate are historical.

## What the suspension means

Render counts both public HTTP/WebSocket responses and service-initiated public
network traffic as outbound bandwidth. Uploading to R2 from Render therefore
still consumes Render bandwidth. Moving persistent files to R2 does not make a
Render-hosted backend or collector bandwidth-free. The notice concerns the
workspace's 5 GB allowance, not exhausted local storage.

The screenshot reports suspension. Hosted tests cannot be described as passing
while those services are suspended. Do not silently add a card, change plans,
disable protections, or attach the future custom domain to bypass this issue.

## Durable storage

- New originals and immutable extraction snapshots use private
  `continua-financial-documents` R2 storage. Render/production scraper startup and
  writes reject any non-R2 driver instead of falling back to local disk.
- Parsing still needs bounded **temporary** files. They are removed after use;
  this policy prohibits permanent document storage on Render, not temporary
  processing. A literal zero-local-file requirement would require moving the
  collector's compute, and is not claimed here.
- Supabase stores authoritative structured records, leases, provenance and audit
  data. Existing legacy private objects remain readable for recovery.
- Duplicate legacy uploads default off (`R2_DUAL_WRITE=false`). Existing legacy
  originals are removed only by the approved reverified migration. Operator credentials alone cannot turn dual writes on.
- R2 checks for an existing object before sending its body, then verifies the
  actual stored size and SHA-256. A HEAD response alone is not trusted evidence.
- New extraction snapshots use deterministic, compressed `gzip-json-v1`, with
  `.json.gz` keys and explicit metadata. Native restoration supports old plain
  `json-v1` and compressed versions, with decoded-size limits. PDFs remain exact
  source bytes, not lossy recompressions. No originals are overwritten.
- Large HTML/JSON/CSV/XML originals use a lossless `gzip-source-v1` stored
  representation when it is smaller and dual-write rollback is disabled.
  Immutable database SHA/size remain those of the **original source bytes**;
  R2 keys/checksums cover encoded bytes. Native reprocessing restores and checks
  the exact decoded source against its recorded SHA/size before parsing it.
  Explicit dual-write mode keeps the older uncompressed representation to
  preserve the private legacy recovery contract. No lossy data transformation
  or source-text rewriting is used.

## Bandwidth reductions

- Cloudflare Cache API: exact public quotes/indices cache for 5 seconds;
  instruments/sectors for 60 seconds. Bypass cookies, personal authentication,
  unknown/duplicate query fields, mutations, private/payment paths and errors.
  Rate limiting and the configured gateway credential remain required before
  any cache hit. Clients retain `Cache-Control: no-store`.
- Enable with `PUBLIC_EDGE_CACHE=true`. No cache hit fabricates a newer source
  timestamp; the maximum public freshness delay is the declared TTL. Cache
  availability/hit rates still need hosted verification on the actual deployment.
- Native Go public JSON: gzip when supported and worthwhile; conditional ETag
  reads send 304 only **after** authentication/rate limiting. Transformation is
  limited to four concurrent public responses and 256 KiB buffered per response.
  Large responses fall back to streaming unchanged. Account/payment data is
  excluded from this transformation.
- Archive backfill defaults to five records every 15 minutes rather than every
  two minutes (`R2_ARCHIVE_CRON`, `R2_ARCHIVE_BATCH_SIZE`). This reduces repeated
  polling/background transfer rate, not total bytes needed for a complete archive.
  Original R2 writes and live price/news collection schedules are unaffected.
- Source, heavy-work and job singleflight prevent overlapping repeated triggers.
  Publication and news bridges scan IDs and materialize one document at a time;
  they do not send an entire archive through service-to-service HTTP.
- Native operator-only `/diagnostics/bandwidth` reports current-process logical
  R2 payload attempts, verified uploads, verified existing objects and avoided
  upload payload bytes. These counters exclude SDK retries, headers, API/database
  traffic and restart history; **Render's billing metrics remain authoritative**.
  Native public-response counters similarly measure response payload only.

## Validation and release

Fixture tests cover R2-only policy, duplicate suppression with checksum checking,
compressed evidence/original-source restoration, edge public hits versus sensitive bypasses,
gzip byte-for-byte decoding, authenticated ETags and bounded response fallback.
No live provider uploads, charges, original-file deletion or hosted cutover were
performed for these tests. Release still requires the exhaustive native ledger,
real memory/restart/concurrency tests and hosted bandwidth measurements.

Native streaming additionally enforces authenticated nonempty issuer
subscriptions, suppresses identical payloads, and caps total queued fanout at
four MiB across all clients. Slow clients are disconnected rather than allowing
unbounded buffering. Canonical quote persistence skips older/identical values
and returns only changed rows for eventual delivery. Collector-to-stream wiring
and hosted savings remain unverified; these are not deployed changes.

References: [Render bandwidth](https://render.com/docs/outbound-bandwidth),
[Render free-service limits](https://render.com/docs/free),
[Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/),
[Go gzip](https://pkg.go.dev/compress/gzip),
[HTTP conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-none-match).
# Browser transport follow-up — 15 October 2026

The native collector's source-scoped browser proxy now applies its 50-MiB budget
across the entire page (all upload/download directions and tunnels), not per
connection. Once exhausted, it rejects new tunnels. This bounds an additional
source of avoidable collector traffic; actual hosted savings remain unmeasured.
Fresh browser startup and all five COOP financial-category probes now pass after
fixing intercepted clicks. This change is not deployed and does not resolve the suspended
Render workspace by itself.
