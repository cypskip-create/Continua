# Continua parallel Cloudflare migration

## Audit and staged plan

- Frontend: React/Vite in `app/`, root npm workspace, `app/dist` output,
  lazy routes. Paystack live initialization/verification/webhook run on Render.
- Backend and scraper: two Render Docker services, independent cron workers,
  PostgreSQL durable document queues. No BullMQ is present.
- Supabase: authoritative database and Auth/RLS. User community media and
  avatars remain in Supabase. Financial raw evidence uses private scraper-raw.
- Cache: memory LRU or ioredis; Upstash REST is a separate optional cache
  driver, not a replacement for a job queue. No Redis credential is assumed.
- Hosting: Vercel stays operational. Cloudflare Workers Static Assets runs in
  parallel on workers.dev. No custom domain or irreversible cutover is needed.
- Existing app manifest is not proof of a functioning offline service worker;
  test actual PWA behavior separately, never cache payments or private APIs.

Stages: build checkout → parallel frontend → gateway/auth → optional distributed
cache → private R2 copy/verification → end-to-end checks → explicit cutover
approval. Do not delete Vercel, Supabase objects, or production configuration.

## Deployment

From repo root run `npm ci`, `npm --workspace app test`, `npm run build`;
then `npx wrangler deploy --config infra/cloudflare/wrangler.jsonc` after
Cloudflare authorization. Configure the scoped server-only BACKEND_API_KEY
with Wrangler secrets, never a VITE variable. The default Worker name is
continua-preview. Set VITE_CONTINUA_API_URL to /api/v1 (same origin)
and set VITE_CONTINUA_WS_URL to the existing Render WebSocket URL.
Render remains the API and webhook origin. Add the exact preview origin
to Render's existing allowed origins and Supabase's callback allowlist.
Keep existing origins; do not replace them during this stage.

The gateway is not an open proxy. Its only upstream is BACKEND_ORIGIN.
Admin routes and Paystack webhooks deliberately stay on the existing Render
origin. It forwards user JWTs for backend authorization; a server API key
does not grant membership. All proxied responses are no-store initially.
Set up an EDGE_RATE_LIMIT binding before exposing the gateway broadly.
Do not trust a public header or CORS alone as authentication.

Cloudflare's Git connection requires dashboard authorization. Build from the
repository root; command `npm ci && npm --workspace app test && npm run build`;
deploy command `npx wrangler deploy --config infra/cloudflare/wrangler.jsonc`.
Watch all repository paths (`*`) on the production branch `main`, as requested.
Keep Render and Vercel integrations. Do not mark Git auto-deploy operational
until a pushed frontend commit actually produces a successful Worker release.

## Automatic deployment repair — 16 October 2026

The Git integration and production deploy command were enabled and the previous
builds had succeeded. Recent backend/scraper commits were skipped because the
include watch paths were restricted to `app/**`, `infra/cloudflare/**`,
`package.json` and `package-lock.json`. No build failure was observed for those
skipped commits: they never matched the trigger.

Changed the existing Worker build trigger to include `*`, with no excluded paths,
while retaining production branch `main`, the repository root, existing build
tests, Wrangler deploy command and all existing secrets. Every pushed commit to
`main`, including docs/backend-only changes, now qualifies for a build. Local
uncommitted edits and pushes to other branches are not production deployments.
An unsuccessful build must leave the last good release active; automatic does
not mean bypassing tests or guaranteeing upstream build-service availability.
This broadens build frequency, not account permissions, paid plans or domains.

Validate by pushing a documentation-only commit outside the former include
paths, then confirm Cloudflare creates and successfully deploys its exact SHA.
Do not use a manual retry as proof of the repaired push trigger. Primary reference:
[Cloudflare build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).

## Payment compatibility

/checkout is a website-layout route, outside app navigation. Upgrade routes
there without an account token in the URL. Optional VITE_CONTINUA_WEBSITE_ORIGIN
supports a separate website origin; users sign in there normally. Card/CVV and
M-PESA approval remain in Paystack's secure window. Prices, live transaction
ownership, amount/currency and activation remain server-owned. Never test by
making real charges automatically. Keep the existing live callback/webhook
configuration until origin changes are explicitly approved and tested.

## Verification and rollback

Verify direct navigation/refresh for every route in App.tsx, login/OAuth/reset,
subscription/portfolio/watchlist isolation, community media, charts and fonts.
Use test fixtures for payments; browser callback success alone is not payment
verification. Check forbidden origins, oversize requests, admin denial,
redirect rejection, private-cache leakage and expired/revoked tokens.

R2 copy must verify checksum and size before any read/write flag changes.
User media is excluded. Keep original evidence identifiers and source rights.
Rollback frontend to Vercel, cache to memory, and evidence reads to Supabase.
Primary origin and storage cutover require a separate explicit approval.

## Costs and limits

Workers free quotas may reject traffic beyond allowances. R2 has a free
allowance but can incur storage/operation charges; the operator says billing
is already activated. Upstash is not provisioned without its own account.
Zone-level WAF rules and custom-domain protections are deferred until a zone
is configured. workers.dev is not a substitute for full zone-level WAF.
Backend cold starts remain a Render hosting constraint, not a CDN fix.

Render's existing IP-based pre-authentication and public API limits see Worker
egress addresses, not individual visitors. Keep the preview limited until a
separately signed, replay-bounded gateway identity is implemented and load tested.
Never solve this by trusting arbitrary X-Forwarded-For or disabling rate limits.
Direct Render WebSockets still use legacy first-party API-key authentication.
The gateway does not yet proxy WebSocket upgrades or mint realtime tokens.
Do not ship the Worker secret to the browser to restore that legacy path.
Realtime compatibility is a remaining validation gate, not a completed migration.

## Current provisioning checkpoint (2026-10-12)

Created private R2 bucket continua-financial-documents; public access disabled.
Created object-read/write credentials restricted to that bucket, expiring
2027-10-12, and saved them as scraper Render environment variables (save-only).
At that checkpoint RAW_STORAGE_DRIVER was not switched and no archive objects
had been copied. The 13 October follow-up implements a bounded R2 archive
backfill and requires a verified driver cutover before reporting active storage.
Parallel Worker deployed at https://continua-preview.cypriankiprop41.workers.dev.
Its deployment token has Workers Scripts Edit, Workers Builds Configuration Edit,
and Account Settings Read, restricted to the operator's one Cloudflare account,
expiring 2027-10-12. It does not have R2, D1, KV, queue, container or DNS access.
This legacy token scope covers Workers scripts in that account, not solely this
Worker; use a per-Worker Editor scope when supported by the deployment workflow.
A dedicated non-admin backend key was approved, created and stored only as the
Worker BACKEND_API_KEY secret. Existing production backend keys were not changed.
The registered build token and Git trigger connect cypskip-create/Continua main
to this parallel Worker, with app/infra/root-manifest watch paths and private
build configuration. Pushing commit 631b23b automatically triggered build
aebdb5a7-6a7f-4485-9de0-b0c40a76f21e. Cloudflare reports successful build and deploy,
with Worker version 63ccf344-93ff-49f0-8f45-39f91659228f (2026-10-12).
The exact preview host was approved for additive Supabase Auth redirect URLs
(root and same-host paths) and Render browser origins. The primary Auth site URL,
Vercel host and live Paystack callback/webhook settings remain unchanged.
Frontend checkout now checks the backend inlineCheckout capability before
initializing an order, preventing an incompatible frontend/backend rollout.
Upstash remains unprovisioned and disabled; memory caching remains operational.

The optional REST cache preserves each caller's supplied millisecond TTL and
namespaces all keys. SET updates its local fallback; DEL clears both stores.
Failures use the local fallback; concurrent misses coalesce per process, not
across distributed instances. No entitlement/payment state uses shared edge HTTP
caching. Provision separate preview/production namespaces before enabling it.

## Private evidence archive follow-up — 13 October 2026

The deployed scraper was still configured for Supabase, explaining the empty
R2 bucket. The R2 driver uploads new raw PDF/HTML/JSON artifacts to the private
bucket and keeps the Supabase rollback copy when R2_DUAL_WRITE=true. No user
media, account records or payment secrets are copied.

`scraper/src/storage/r2Archive.js` copies retained evidence in batches of five,
on startup and periodic scheduling when RAW_STORAGE_DRIVER=r2. It verifies
size and SHA-256 before compare-and-set reference updates. No original object
is deleted. Extraction versions are archived as immutable JSON snapshots with
raw-object references, document/source identifiers and unchanged review flags;
all historical versions advance in ID order, not only the latest version.
Failures retain the original reference and retry after a cooldown so a missing
legacy file cannot block the entire archive. Lost ephemeral local files still
require source re-fetching; this migration cannot recover deleted bytes.

R2 write verification uses a streaming digest instead of a second full-file
buffer. Stored Supabase reads enforce a streaming size limit. Browser rendering
has one active context and closes Chromium after every page, including failures;
scheduled source/sweep/archive work is serialized to reduce overlap on 512MB
Render. Memory diagnostics include Linux container usage (child processes),
not just Node RSS. These controls reduce identified risks but do not establish
that all memory-limit failures are permanently eliminated; observe real metrics.

Language choice: Node/JavaScript for bounded object-storage/network control,
SQL for durable verified checkpoints, native Chromium for dynamic pages. No
Go/Python rewrite would remove Chromium's memory footprint by itself.
Primary references: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
and https://nodejs.org/api/process.html#processmemoryusage.

Verified rollout: scraper commit `dd246dcc983a3be791358fdc3a944968c9e4a252`
is deployed. RAW_STORAGE_DRIVER was changed from supabase to r2 in the existing
Render service; restricted credentials and original storage copies were retained.
At the first follow-up count, 33 of 13,313 raw artifacts had verified R2 references,
including 10 PDFs, and 10 artifacts had extraction snapshots archived. Counts
continue changing as collection and backfill run; this is NOT full archive
completion. Cloudflare's live object listing showed nse/ and extractions/ objects
even while overview storage counters still showed zero. The first copied batch
logged copied=5, failed=0. All seven hosted service/data/authorization smoke
checks passed. The scraper suite passed 83 tests with the real Python PDF worker;
Windows lacks the Poppler binary installed in the Render Docker image.
