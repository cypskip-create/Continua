# Verified duplicate raw-file retirement

The user authorized removing Supabase raw files after Cloudflare migration.
`VerifiedLegacyCleanup` runs only in the finite migration workflow, never in
the Render scraper. It uses the existing migration credentials and private
financial bucket. Accounts, user data and database records are preserved.

Candidates must be content-addressed files in `scraper-raw`, no larger than the
existing 50 MiB object ceiling. Every associated artifact must point to one
owned R2 object with one hash and size; no artifact may still use the legacy
path. Both migration checkpoints and earlier duplicate-write keys are covered.
Largest verified duplicates are considered first to free storage within the
finite runtime, rather than spending the whole run on tiny files. The worker
freshly streams and hashes the R2 copy and Supabase original, checks
all references and the original object identity again, writes a verification
receipt, then removes that exact file through the Storage API. It verifies
absence and records completion. It never deletes directly from storage tables.

A session advisory lock serializes each original. Cancellation waits for active
cleanup before closing readers. Failed checks defer the candidate for a day;
transfer exhaustion preserves completed counts and pauses without deleting the
unverified object. A crash after removal can leave a conservative
`verified-before-removal` receipt; that does not claim completion. R2 objects,
extraction versions and SQL evidence are never removed by this job.

The approved migration ceiling remains 384 MiB/run and 1 GiB/day. The workflow
uses 256 MiB per run so four six-hour runs fit that daily ceiling. Cleanup and
migration share it; normal collection keeps its separate allowance. Automatic
migration and cleanup expire November 17, 2026. Engine processing continues.
Already-R2 extraction snapshots continue to archive under the normal allowance
after that date. Steady-state selection accepts only R2 artifact pointers and
refuses legacy reads even if a caller bypasses selection. The workflow unsets
all Supabase file credential variables before starting the steady-state process.
An expected transfer-budget pause is not rethrown during archive shutdown.
Deleting files reduces retained storage and future file traffic; it does not
erase previously incurred monthly egress.

Validation: five cleanup unit tests, the full 162-test collector suite (six
external-database fixtures skipped locally), and 80 disposable PostgreSQL
checks passed. Actual candidate SQL rejects still-referenced originals and
includes old duplicate-write keys. The CI numerical fixture now loads its
unreachable test DSN before static configuration imports; all 491 Engine parity
cases passed with DATABASE_URL unset externally. Production results must be
read from workflow receipts and storage inventory, not inferred from these tests.

Production checks on October 19: the previously failing native candidate check
passed on commits 8b2584a, d7fc677 and 306441a. Three successful, bounded cleanup
runs removed 175 originals (276,772,835 bytes), with zero verification/removal
failures and zero uploads. Cloudflare copies were retained. This is partial
retirement, not a claim that the roughly 4 GB archive has finished migration or
that historical monthly usage totals have reset.
