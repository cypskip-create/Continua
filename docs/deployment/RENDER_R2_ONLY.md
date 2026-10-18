# Render scraper file storage

The deployed scraper's durable file transport is private R2 only. New raw
artifacts are immutable and hash-verified; text payloads use lossless gzip when
smaller. Supabase upload and legacy-read transport code has been removed.
Production extraction selects R2-backed artifacts rather than repeatedly
requesting legacy objects. Development local files remain supported.

Render does not need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or
`SUPABASE_STORAGE_BUCKET`. Remove those three file-storage settings from
`continua-scraper`. Keep `DATABASE_URL`: it coordinates source permissions,
leases, metadata, canonical numerical facts and job receipts in the existing
database. Removing it would stop automatic processing and is separate from
removing Supabase **file storage**.

The temporary GitHub Actions migration has its separately approved encrypted
legacy read credential and expiry. Removing credentials from Render does not
revoke that migration credential or delete its remaining source files. Financial
originals remain until exact verified copies and reader retirement permit safe
cleanup. The 18 application-image originals have already been independently
verified and removed under the user's explicit approval.

Validation: 12 storage-policy/R2/compression tests passed, including proof that
new writes and legacy-read rejection issue no Supabase request. Scraper build
and declaration checks passed on 2026-10-18. No new service is provisioned.
