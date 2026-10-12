# Private financial archive copy

Python is used here for a resumable operator-side inventory and checksum journal;
the existing scraper remains Node/TypeScript. No user avatars or Hub uploads are migrated.

Install `requirements.txt` in a dedicated virtual environment. Provide server-only
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=scraper-raw`,
`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` privately.
The script can read the existing ignored backend/.env.local for source credentials.

Run `python migrate_financial_documents.py --limit 100` for a dry-run inventory.
Add `--copy` to copy that bounded batch; resume with the reported `--after-id` cursor.
Retain the SQLite journal. Every run rechecks existing destination bytes and SHA-256;
conflicting objects fail rather than overwrite. Failures report artifact IDs only.
The first migration covers PDF raw artifacts, not every HTML/OCR input.

Never delete source objects or rewrite database pointers during this copy stage.
Keep `RAW_STORAGE_DRIVER=supabase` until verified coverage and a separate cutover checkpoint.
Later `RAW_STORAGE_DRIVER=r2` uses dual-write by default. Retain R2 bucket configuration
and Supabase credentials during rollback, including for `r2://` prefixed references.

The R2 key created on 2026-10-12 is object-read/write scoped only to the private
`continua-financial-documents` bucket and has a one-year lifetime. Rotate before expiry.
No public bucket URL or domain is enabled.
