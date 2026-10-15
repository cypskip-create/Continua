# Native operator tools

`backend-go/cmd/continua-admin` replaces the common SQL migration execution
mechanism with Go's transaction and cancellation primitives. SQL remains SQL;
there is no Node forwarding process. The executable reads only bounded SQL files
under the repository's migration directories using a rooted filesystem handle.
Planning is offline by default and emits the selected file's SHA-256, version,
name and statement count, never database credentials or SQL contents.

`--validate` runs inside a transaction and rolls back. `--apply` is an explicit
mutation. Both require a registered migration protection workflow. Unsupported
workflows fail closed before opening the database; they can still be planned.
The transaction takes an advisory lock, rejects conflicting recorded migration
names, executes registered postconditions before commit, and rolls back on any
failure. It does not claim to verify the checksum of historically applied files:
the existing Supabase migration ledger does not retain that checksum.

Registered postconditions currently cover native payment attempts/card renewals,
checkout acknowledgement columns, document validations, invalid filing archives
and nullable partial-statement fields, plus the native research-refresh outbox's
RLS, private grants, required columns and due-work index. Payment/document tables must have RLS and
no direct anonymous or authenticated table access. These are not substitutes for
the remaining migration-specific behavioral probes (community safety, billing
activation/retry/renewal/expiry, financial audit triggers and storage provenance).
Native community, billing-ledger and financial-audit probes are now registered
and execute within savepoints that always roll their synthetic records back.
Their presence is implementation, not proof of full hosted-schema validation.
No hosted migration was run while developing these commands.

Tests cover quoted PL/pgSQL bodies, nested comments, escaped literals, transaction
escape rejection, bounded rooted file access, required postconditions, validation
rollback, failed-protection rollback and explicit successful commit behavior.
The commit/rollback tests use an isolated SQL driver fixture, not a production
database. Real PostgreSQL migration/recovery tests remain a release gate.

The dedicated PostgreSQL 17.11 fixture now verifies the outbox workflow using the
actual retained core market schema: validation rolls back DDL, explicit apply
persists registered protections, retries recognize the migration, unchanged
quotes produce no duplicate event/outbox version, and a forced outbox constraint
failure rolls back the quote write. Nanosecond input is normalized to the same
milliseconds exposed by the quote/research contract. This is not a full hosted
schema, multi-owner RLS, restart or provider integration test.

On Windows, `infra/migration/native-postgres-fixture.ps1` creates a separate
digest-pinned, non-root, loopback-only, RAM-backed 256-MiB fixture, runs that test,
then removes only the captured, label-verified container. It does not use
`DATABASE_URL` or the existing local Supabase containers. The test additionally
refuses any non-loopback URL, unexpected database name or nonempty fixture DB.
The candidate CI workflow now includes the same separate PostgreSQL service/test
and Go race checks; these hosted CI additions have not yet run because no commit
or push was performed. They are not counted as passing hosted validation.

## Data API key operations

`backend-go/cmd/continua-key` supports `--create-name NAME` (optional
`--rate-limit`, default 120/minute) or `--revoke-id UUID`. Without `--apply`, it
only reports an offline plan. With `--apply`, it uses the configured verified
database connection and a 15-second operation deadline. Creation preserves the
existing `afk_` prefix, 24 random bytes and scrypt lookup parameters; only the
hash is persisted. The one-time plaintext is emitted to the operator's stdout:
do not run creation inside shared CI logs, paste output into chat, or expect to
recover it from the database. Revocation targets one exact UUID; existing API
instances may retain the old authentication cache for up to 30 seconds.

The command grants data API access only, not admin, user authentication or paid
membership. Names/control characters and rate limits are validated. SQL-driver
fixtures check hash compatibility, invalid-input rejection and exact-ID revoke.
The separate PostgreSQL fixture also verifies actual creation, lookup,
authentication and rejection by a fresh API instance after revocation, preserving
the documented short-lived cache on an already-running instance. Only disposable
synthetic fixture keys were created; no existing/local Supabase or hosted key was
changed. Expiry/concurrent-host restart validation remains separate.

## Reviewed publication and maintenance

`continua-review` targets only an explicitly configured `NATIVE_ADMIN_ORIGIN`,
checks native Go liveness before sending the server-only `ADMIN_API_KEY`, refuses
redirects and bounds request/response bodies. The key belongs in the operator's
private environment, never in browser code or shared command output.

- `--operation list-candidates` and `candidate --candidate ID` read review data.
- `confirm`, `confirm-single` and `reject` require an exact candidate ID.
- `reviewed-transcription --review-file FILE` preserves the original source hash,
  private R2 evidence, source permission and active issuer. It refuses replacing
  pending/rejected automated candidates. All tables publish atomically.
- `validate-transcription --review-file FILE` validates provenance without writes.
- `repair-condensed --extraction ID` preserves the explicit SCOM legacy repair:
  a future-dated bundle must be archived before replacement, a currently valid
  bundle is protected, and parser/issuer/permission checks remain mandatory.
  `validate-condensed-repair` performs the rollback-only counterpart.
- `run-job --job NAME` accepts only registered native jobs. The scheduler
  coalesces duplicate work and preserves cooldowns; no arbitrary job/code runs.

Mutating operations emit offline plans by default. `--apply` explicitly submits
them. Plans contain payload digests, not the private review text. Validation and
read operations contact the configured private native service but do not publish.

`continua-admin` additionally provides:

- `--workflow NAME`: atomic repository-owned migration sets, with offline plans,
  rollback validation or explicit apply. Registered sets cover history, candle
  provenance, community safety, research notebook/audit, native payments, billing
  policy, invalid archives, document validation, Kakuzi identity and close-only
  publication infrastructure.
- `--import-history FILE`: bounded streaming real OHLCV validation and optional
  reviewed import. Conflicting stored observations abort the entire transaction;
  no close-only values become artificial candles. The default makes no writes.
- `--import-research FILE`: strict official CBK/KNBS/NSE/CMA observations with
  kind-specific evidence and permission requirements. Default validation is
  offline. Explicit apply atomically updates reviewed records/current indices.
- `--revalidate-news`: default offline plan; explicit apply repairs source-evidenced
  issuer links in bounded pages. `--after` and `--batches` support resumption.
  Articles and publisher dates are not deleted/changed.
- `--inspect NAME`: fixed read-only payment-schema, index-freshness,
  publisher-coverage, history-coverage, history-inventory, filing-publication or
  archive-coverage diagnostics. No arbitrary SQL or credentials are printed.
  `portfolio-overview` requires an explicit `--owner UUID` and prints counts and
  timing only; it never chooses or prints other users' accounts.

## Python collector and offline Engine operators

Use `python scraper-python/scraper_cli.py --operation NAME`. New originals always
use private R2; legacy Supabase is a private migration reader, not an implicit
dual-write target. Collection, registration, archive, recovery, reprocessing and
source-policy mutations default to offline plans and require `--apply` to run.

Source registration preserves existing operator disables unless explicitly
replacing a definition. `record-permission` requires an exact source, permission
reference and allowed usage; it does not enable collection or approve mappings.
`enable-licensed-nse` separately requires `--scope-confirmed` and an explicit
reference, and atomically enables only the two registered NSE collectors.
`disable-news-source` removes that source's public news and disables it while
preserving immutable original/extraction evidence.

`collect-source`, `discover`, `enqueue`, `backfill-history` and
`backfill-kenyanstocks` require explicit source IDs and bounded batches. A failed
seed retry must name one exact registered approved-source URL.
`recover-artifact` restores only bytes matching the retained original SHA-256;
changed live content cannot silently replace the original artifact.

Read-only `inspect-extraction --extraction ID` and
`inspect-archive-layouts --source ID` do not need `--apply`. Full public source
text requires the separate `--include-source-text` flag and has a strict budget.
No credentials or user-account data are included.

`python engine-python/engine_cli.py --operation draft-bond-report --input FILE
--source-url URL` is an offline deterministic draft command. It never publishes,
contacts an AI provider or makes a payment. CLI filenames deliberately avoid
shadowing standard-library modules such as `operator` or `html`.
