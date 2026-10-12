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
Scope watched paths to app/, infra/cloudflare/ and root package manifests.
Keep Render and Vercel integrations. Do not mark Git auto-deploy operational
until a pushed frontend commit actually produces a successful Worker release.

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
RAW_STORAGE_DRIVER was not switched. No archive objects have been copied yet.
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
build configuration. Auto-build success still requires a pushed build to verify.
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
