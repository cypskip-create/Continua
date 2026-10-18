# Application media on Cloudflare

The approved `continua-public-media` bucket is separate from private financial
evidence. Direct public R2 access stays disabled. The existing `continua-preview`
Worker binds only this media bucket as `MEDIA_BUCKET`; it never binds the
financial bucket. `/media/*` serves strictly scoped raster object keys.

Uploads use `POST /api/v1/media/{avatars|banners|post-images}`. The Worker checks
the current account against the fixed owned Supabase Auth endpoint, using the
existing public project key in the encrypted runtime setting
`SUPABASE_PUBLISHABLE_KEY`. No service-role credential or R2 API key is required.
Write paths derive from the verified account identity, a unique upload ID and
the SHA-256 of the image bytes. Accepted raster signatures and MIME types must
agree, image bytes are limited to 5 MiB, and a dedicated rate binding permits
10 mutations per minute per client IP. Cleanup deletes require the same owner.
The established Cloudflare site and two stable Vercel aliases are allowed;
unrelated origins cannot upload. Public image reads support cross-origin use.

All four application upload entrypoints now use this Worker. Accounts, profile
records and post records remain in Supabase. No Supabase file upload fallback
is used. The server-only financial archive credentials remain separate.

## Existing images

`scraper-python/migrate_media.py prepare --directory .qa-artifacts/media-migration`
reads the three owned legacy buckets inside a reserved 16 MiB normal collection
allowance. It creates a local manifest and deterministic destination names;
source bytes and objects remain intact. The reviewed batch contains 18 images
and 10,376,470 bytes. Upload the prepared `avatars`, `banners` and `post-images`
folders to the isolated bucket, preserving their directory structure.

After the Worker deployment, `migrate_media.py publish` with the same directory
reads each cloud image, checks its exact size and SHA-256 against the prepared
source, then changes profile/post URLs in one transaction under row locks.
Corrupt or unavailable cloud bytes prevent every database change. Repeating
publication is idempotent. No source file deletion is part of either command.

Do not commit the local manifest, image copies, downloaded environment files
or credentials. Original file removal requires a separately verified cleanup.
Do not claim Supabase quota relief while the original objects remain present.

Validation: 17 Worker/gateway tests, 115 existing frontend tests, a production
frontend build and Wrangler dry-run. Migration tests cover exact owned URL
matching, deterministic immutable copies, corruption rejection before database
writes and idempotent publication. Authenticated live-user uploads require an
actual signed-in application session; fixtures are not proof of such a session.

## Verified production result — 18 October 2026

Commit `51643b4` reached Cloudflare's Ready state. All 18 image hashes and sizes
matched through the live Worker; three profiles and two posts switched URLs.
The current profile/post references contain no Supabase Storage URLs. Live
anonymous uploads return 401, unrelated origins return 403, the established
Vercel preflight returns 204 and a private-financial prefix returns 404.

The restrictive `continua_cloudflare_only_file_writes` policy is applied to
`storage.objects` for `anon` and `authenticated`, blocking new inserts/upserts
and updates without granting additional reads or removals. Its owner boundaries
and denial behavior pass the disposable PostgreSQL fixture (62 total checks).
Application account and business-data tables are unaffected.

After separate explicit approval, all 18 original images were rechecked against
their live Cloudflare copies and removed through the Storage API: three avatars,
one banner and 14 post images (10,376,470 source bytes). No financial object was
deleted. The financial legacy archive remains a separately bounded migration;
this image cleanup does not establish overall Supabase quota compliance.
