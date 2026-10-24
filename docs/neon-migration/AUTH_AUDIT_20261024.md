# Authentication audit — 24 October 2026

The eight original Supabase users **were migrated**, with their original UUIDs,
email addresses and bcrypt password hashes. They are in self-hosted Better Auth
tables on Neon, **not** in managed Neon Auth's `neon_auth."user"` table.
An empty managed Auth dashboard therefore does not establish a failed import.

## Current read-only database evidence

Live checks ran on 24 October 2026 at approximately 19:28–19:29 Africa/Nairobi.
Both connections used certificate-verified TLS and repeatable-read, read-only
transactions, closed with ROLLBACK. No sign-ins, new accounts, password resets,
email deliveries, identity updates or source deletions were performed.

| Record | Supabase source | Neon production |
| --- | ---: | ---: |
| Auth users | 8 | 8 |
| Application identities | Source auth UUIDs | 8 |
| Better Auth account records | Not applicable | 9 |
| Profiles | 8 | 8 |
| Portfolio holding rows | 16 | 16 |
| Watchlists | 33 | 33 |
| Watchlist folders | 9 | 9 |
| Public portfolio snapshots | 0 | 0 |
| Engine portfolio snapshots | 9 | 10 |

All eight source UUID/email/password-hash tuples match the target credential
records. None of the eight application identities lacks a Better Auth user.
Profiles, portfolios, watchlists and watchlist folders have **zero orphaned
user_id references** in either database. All eight users' `subscription_plan`
and `subscription_expires_at` fields match exactly between source and target.
The live checks compare counts and ownership integrity, not every current
application column. The additional engine snapshot is a target/source difference;
its contents were not reconciled in this audit.

The ignored local receipt is
`.qa-artifacts/neon-migration/auth-readonly-audit.json`. It contains aggregate
results and non-secret endpoint identifiers, not passwords, hashes or user emails.

## Export and import evidence

The protected final archive receipt identifies source snapshot
`00000003-0001F6DF-1`, eight original users and 102 application tables with exact
PostgreSQL row hashes matched at import. Its flags say no synthetic staging users
or legacy sessions were imported and no source data was deleted. The import
receipt's `providerConfigurationSwitched:false` describes that import phase,
not the later deployment state.

The separate final-source-stability receipt, dated 23 October 2026 at
11:42:28 UTC, records all 102 source tables unchanged since import, matching
identity/password digests, zero verified source MFA factors and zero target
sessions before production sign-in opened. Earlier staging evidence references
seven users; the final production import and today's live comparison both show
eight. The source still contains all eight accounts and the linked records above.

## Frontend and backend implementation

`app/src/integrations/continua/browserClient.ts` constructs the owned Continua
client unconditionally. Its compatibility export is still named `supabase`,
but it does not construct a Supabase SDK client. Registration and password login
call same-origin `/api/v1/identity/signup` and `/api/v1/identity/signin`.
Cloudflare forwards allowlisted identity operations to Render; Render calls
self-hosted Better Auth. No managed Neon Auth SDK or endpoint participates in
this active path. This is **Better Auth hosted by Continua, with Neon as its
database**, rather than Neon's managed Better Auth service.

`backend/src/auth/runtime.js` requires `AUTH_PROVIDER=better-auth`, a TLS Neon
`DATABASE_URL`, independent auth secret, public origin and bot-check secret.
It uses the `app_identity,public` search path. `continuaAuth.js` explicitly names
the `continua_auth_user`, `continua_auth_account` and `continua_auth_session`
tables and uses bcrypt for password hashing and verification.

The access verifier checks the JWT through Better Auth. Inspection of the
installed JWT implementation confirms signature, algorithm, issuer, audience
and expiry verification. Continua additionally enforces UUID subjects/session
IDs, authenticated role, a maximum five-minute token lifetime and a live,
unexpired session joined to a non-deleted application identity. MFA and recent
password checks use server-side assurance records, not browser claims alone.
This verifier is for Continua's own Better Auth sessions; it is not a managed
Neon Auth session verifier.

## Project, database, branch and deployment

The final import receipt identifies existing Neon project
`orange-bird-13151544`, production branch `br-noisy-block-b4z5yxup`.
The saved final Render configuration used in today's successful live database
check selects `AUTH_PROVIDER=better-auth` and database `neondb` at
`ep-nameless-voice-b4ygobrp.c-6.us-east-2.aws.neon.tech`.
The production input guard independently pins that same endpoint; `.neon`
identifies the same project and the production branch name. The isolated
staging branch is `br-still-field-b4mo8s63`.

The source is existing Supabase project `jjsetogmnumoudrovpzn`. The saved edge
configuration routes the owned origin
`https://continua.cypriankiprop41.workers.dev` to
`https://continua-backend.onrender.com` with `AUTH_PROVIDER=better-auth`.

Prior deployed evidence dated 24 October 2026 at 06:52 UTC records a manually
established production session reading 12 owned portfolio rows, zero other-owner
rows, an invalid session rejected with 401 and an owner-only authenticated
WebSocket snapshot. Earlier deployment receipts record the owned session route
working and the legacy route returning 410. The migration status records user
confirmation of Google sign-in and recovery-email receipt. Those are historical
receipts, not newly repeated positive-session or mail tests.

Fresh public requests in this audit reached the owned site (200). A verification
probe without Origin was correctly rejected (403); with browser-equivalent
headers it encountered a pre-authentication 429. The saved Cloudflare management
login returned 401, so current management settings could not be reread. Current
Render environment settings and the exact project/database/branch currently
selected in the user's dashboard were not independently observed. Therefore
the code, successful database connection and recorded deployment agree, but
today's end-to-end session acceptance and dashboard selection are not newly
certified. No production authentication mutation was used to overcome this limit.

## Supported password migration and safest next steps

Better Auth's official Supabase migration guide supports copying users and
credential account rows while preserving IDs and `auth.users.encrypted_password`,
provided the target verifier is explicitly configured for bcrypt. Continua's
`infra/neon/import-credentials.mjs` implements this approach and refuses a
nonempty credential target, unsupported providers or unsafe source account states.
It must **not** be rerun against today's nonempty production target.

Neon's current **managed** Auth migration guide says existing password-based
users cannot migrate through that documented flow because the hashing algorithms
differ. The old Stack Auth migration article describes a different product/API;
it is not proof that the current managed service accepts these bcrypt imports.
Copying the current tables into `neon_auth` is not a supported next step.

1. Retain the working self-hosted Better Auth architecture for continuity. The
   existing eight credential accounts need no second import or password reset.
   Use `SELECT count(*) FROM app_identity.continua_auth_user;` on the production
   database to inspect the actual provider's user count.
2. In the dashboard, compare the project, production branch, database and
   connection endpoint against the identifiers above. Renew management access
   to confirm the live Render and Cloudflare settings match the saved settings.
3. Complete a controlled existing-user browser check after the rate-limit issue
   is fixed: password login, reload, owner data, entitlement and sign-out. This
   audit did not use or request anyone's plaintext password. Keep email/reset
   and account-creation tests isolated unless separately authorized.
4. Preserve original UUIDs and existing user_id foreign keys. If a different
   provider assigns new subjects, require an explicit, uniquely constrained,
   verified subject-to-original-UUID mapping. Never relink by unverified email
   or create replacement profiles to make a new account appear functional.
5. If managed Neon Auth is still desired, first obtain a currently supported
   password-import/transition method from Neon and prove compatibility,
   UUID mapping, MFA, email changes, account recovery, revocation and owner
   isolation on an isolated branch. Do not switch the frontend first.
6. Preserve source data, protected archives and recovery keys. Neon already has
   post-cutover writes; do not redirect production back to Supabase without
   reconciling those writes. Establish an independently recoverable backup copy
   before eventual source retirement.

References:
- https://better-auth.com/docs/guides/supabase-migration-guide
- https://neon.com/docs/auth/migrate/from-supabase
- https://supabase.com/docs/guides/auth/password-security

## Follow-up fixes prepared in this audit

The Home and Portfolio charts now use a controlled reference dot at the same
observation selected by pointer scrubbing, rather than depending on Recharts'
disabled active-dot behavior. Portfolio category positions use unique timestamps
instead of potentially repeated date labels.

Sign-out previously shared IP counters with ordinary API/identity traffic at
the edge, backend admission and identity router. The observed pre-authentication
429 establishes a current throttling condition, although it is not a captured
trace of the user's particular click. Sign-out now has its own bounded key at
all three layers. Duplicate client requests share one promise; restoration waits
for sign-out; the client clears local identity only after server confirmation.
Settings displays pending progress, disables repeat clicks and reports failure.
Network outages and Render cold starts can still delay server confirmation.

These code changes are local and have not been deployed by this audit. They do
not bulk-revoke sessions, change credentials or modify production identities.

Validation completed: all 169 frontend tests, all 36 Cloudflare tests, 16 focused
backend authentication/admission tests, frontend TypeScript checking, the
production frontend build and `git diff --check` passed. The backend HTTP tests
used mocked providers and local servers; sandbox restrictions required their
rerun with local-network access. No production sign-out was performed and the
chart markers have not received a live browser visual check in this audit.
