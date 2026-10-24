# Neon migration candidate

Run commands from the repository root. Production remains on Supabase. The auth,
data and edge adapters are opt-in and must not be selected in a deployment until
all release gates in `docs/neon-migration/STATUS.md` pass and cutover is approved.

## Offline checks

```powershell
node --test infra/neon/*.test.mjs infra/cloudflare/*.test.mjs
```

## Isolated database fixtures

These scripts write synthetic accounts and fixture data only on the existing
`br-still-field-b4mo8s63` branch of `orange-bird-13151544`. They reject a production
branch manifest and never use the Neon CLI's implicit context. They do not run
schema migrations. The initial restore, Better Auth schema, private assurance
schema, approved staging role grants, application ACLs and billing-owner guard
must already be applied. Never run a fixture against a production import.

Set `CONTINUA_MIGRATION_PRIVATE_DIR` to the existing ACL-protected private
migration directory. It must contain `neon-staging.url` and
`better-auth-staging.secret`. Keep these outside Git; never paste their values
into command arguments or logs. The branch manifest defaults to the ignored
`.qa-artifacts/neon-migration/staging-branch.json`, or can be selected using
`CONTINUA_MIGRATION_MANIFEST`. Both endpoint and branch identity are checked.

```powershell
node infra/neon/better-auth-flows.mjs
node infra/neon/google-callback-fixture.mjs
node infra/neon/price-alert-fixture.mjs
```

The auth fixture covers password, MFA, single-use recovery, challenge cancellation,
email changes, session revocation, RLS ownership and the billing trigger. Its
synthetic users and holding remain marked by `.invalid` email addresses and must
be excluded from the final production import. The Google fixture uses locally
signed tokens and stubbed token/JWKS responses; it blocks all other fetches. It
does not establish that a real Google browser login works. All mail goes to an
in-memory outbox. The price-alert fixture checks SQL decimal comparison, owner
isolation and concurrent exactly-once notification delivery, then deletes only
its newly created fixture identities. No real payment or AI call is performed.

Receipts go into ignored `.qa-artifacts/neon-migration`. A receipt is evidence for
its stated fixture only, not production readiness. Review the storage-reference
gap and remaining realtime/functions/deployment work before requesting cutover.

## Storage evidence

`storage-references.mjs` creates a dry-run plan from database rows and verified
object receipts. It requires exact path/hash/size agreement, preserves bigint IDs
as strings, rejects unsafe target keys and reports absent objects explicitly.
It does not update references, delete originals or infer bytes from filenames.

## Additional release operators

`account-delete-fixture.mjs` additionally requires `account-cleanup.sql` on the isolated staging branch. It removes only its newly created synthetic identities and leaves original users unchanged. `price-alert-fixture.mjs` now covers private-room membership grant/revocation and bounded scheduled alert delivery as well as exactly-once SQL price alerts. The numerical indicator series in that fixture is stubbed.

A real Google browser staging login separately passed original-account continuity; temporary localhost client entries were removed. The Google app has been published with explicit approval. No fixture script proves deployed Cloudflare/Render behavior.

Read `docs/neon-migration/PRODUCTION_CUTOVER.md` before production operations. `production-inputs.mjs` requires a protected explicit approval record and the exact existing endpoint; never manufacture approval to satisfy a script. The ordered tools are `capture-source-permissions.mjs`, `backup-frozen-source.mjs`, `encrypt-final-backup.mjs`, `restore-empty-production.mjs`, `finalize-production-storage.mjs`, `verify-private-originals.mjs --production` and `verify-final-source-stability.mjs`. Run `audit-current-source-storage.mjs` before and after the final freeze; any unproved current object requires an exact additive transfer before release. The final production import receipt records eight original users and 102 application tables with matching row hashes. The 24 October read-only authentication audit reconfirmed the eight original UUID/email/bcrypt tuples in the self-hosted Better Auth tables; see `docs/neon-migration/AUTH_AUDIT_20261024.md` for evidence and current deployment verification limits. A staging receipt alone does not prove a production restore, and post-cutover writes prohibit a blind rollback.

For a local PostgreSQL TCP outage, only the artifact verifier supports `--https-read`. Install the official pinned driver into ignored QA storage with `npm install --prefix .qa-artifacts/neon-http-operator --no-save --package-lock=false @neondatabase/serverless@1.2.0`. It sends the same read-only query to the exact guarded Neon endpoint over HTTPS. It does not change the application's driver, transactional operators or certificate checks. Use Node's documented `--use-system-ca` only when the Windows trusted CA store is needed; never disable TLS verification.
