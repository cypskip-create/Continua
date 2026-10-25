# Fresh managed registration readiness — 24 October 2026

**Update:** The owner approved the staging MFA/email-change exceptions and work
continued on an isolated branch. This readiness audit describes the preceding
stop point. See [MANAGED_AUTH_STAGING_20261024.md](MANAGED_AUTH_STAGING_20261024.md)
for current implementation, live test results and remaining production gates.

## Approved scope and present stop point

The owner's pasted request approves fresh registration instead of importing
legacy credentials. It does not approve a database reset, reuse of old owners by
email, transfer of old entitlements, loss of mandatory security controls, or a
production cutover. It explicitly requires stopping for approval if MFA or another
mandatory control cannot be preserved by documented managed methods.

Fresh registration removes the bcrypt-import blocker in the earlier assessment.
It does not resolve the MFA and verified email-change incompatibilities. Current
official docs were rechecked on 24 October:

- MFA remains forthcoming on the [managed roadmap](https://neon.com/docs/auth/roadmap).
- The [user-management guide](https://neon.com/docs/auth/guides/user-management)
  explicitly says email-address changes are currently unsupported.
- The inspected official published SDK is `@neondatabase/auth@0.7.0-beta`; its
  managed adapter does not provide the existing MFA interface. Browser plugins
  cannot add server capabilities to the managed service.

No production provider settings, identities, UUIDs or application rows were
changed by this audit. No staging managed account was created. No password,
session or credential was copied into `neon_auth`. No security control was removed.

## Current preservation evidence

The new read-only production snapshot at approximately **20:31 Africa/Nairobi**
contains **7** self-hosted auth users, 7 canonical identities, 7 profiles,
16 portfolio rows, 33 watchlists and 8 watchlist folders. All seven current users
have matching UUID/email/password tuples in the preserved Supabase source.
There are no owner orphans in the checked profile/portfolio/watchlist/folder
tables. No current auth user has TOTP enabled, but the current application still
offers that feature and enforces it when enabled.

This differs from the earlier eight-user audit. The frozen source still contains
eight users. Exactly one source UUID is absent from the current target and has
an existing durable account-deletion cleanup receipt created at
**19:34:36 Africa/Nairobi on 24 October** (`16:34:36.610Z`). That is consistent
with the deletion workflow; this read-only audit does not establish who initiated
it or whether it was intentional. The profile and folder counts also decreased
by one. The retained cleanup receipt has no completion timestamp. Do not restore
the account, recreate it, or change the cleanup queue without clarification.

The historical eight-user archive remains retained. Its AES-GCM decryption and
SHA-256 were reverified without writing a new plaintext archive:

- Original archive: **45,997,001 bytes**.
- SHA-256: `51b7d403de498b263137994ce9b1d6d4d4a176b462836ba73cceeba6bd0b9dc8`.
- Original import receipt: eight users and 102 matching application tables.

A **new current-state auth-record backup** was also created:

- Scope: all records in **14 `app_identity` tables**, including credentials,
  sessions, mappings, assurance, verification and cleanup records; live schema
  metadata for those tables and the application auth functions is included.
- Format: lossless PostgreSQL row JSON strings inside an encrypted structured
  backup, not a full database SQL archive. The local `pg_dump` is version 17.2
  while Neon is 18.6, so the incompatible dump command was not treated as success.
- Archive payload: **61,101 bytes**.
- SHA-256: `ca5863cb8e35795b9ee5f513d78dc0e30ece55646ae6a30ad6a3c31e8eabf95e`.
- AES-256-GCM encryption, persisted-file readback, Windows DPAPI key recovery,
  decryption checksum and every table's count/row checksum against the same
  read-only snapshot all passed.
- A protected temporary copy and an encrypted Git-ignored workspace mirror exist.
  No plaintext auth-row backup was written. Existing protected runtime secrets
  remain necessary for full service recovery. DPAPI depends on the current
  Windows profile; an independently recoverable key copy and a full restore
  rehearsal remain outstanding before any cutover.

Receipts, without identity details or credentials, are under the ignored
`.qa-artifacts/neon-managed-assessment/` directory. The production SQL operations
used read-only transactions. Current financial tables were counted, not exported
or rewritten; a fresh whole-database backup and final reconciliation are still
cutover gates. A historical snapshot must never overwrite post-cutover writes.

## Audited dependency map

| Concern | Existing implementation and migration dependency |
| --- | --- |
| Auth endpoints | `backend/src/auth/identityRoutes.js`: session, verify, factors; signup, signin, signout, Google, recovery/reset, email, password verification and MFA; restricted provider callbacks |
| Owned gateway | `infra/cloudflare/identity.mjs`, `worker.mjs`: origin/CSRF checks, allowlists, server credentials, cookies, rate limits and no-store |
| Frontend client/state | `app/src/integrations/continua/{browserClient.ts,client.js,identityClient.js}`, `hooks/useAuth.tsx`: owned transport, session restoration, in-memory JWTs, pending MFA/recovery, cache cleanup and cross-tab logout |
| UI/protected pages | `pages/Auth.tsx`, `pages/Settings.tsx`, `components/layout/ProtectedRoute.tsx`, `components/security/*`: keep branding/layout; adapt supported flows without pretending unsupported controls work |
| Auth runtime/JWT | `backend/src/auth/{runtime.js,continuaAuth.js,verifyAccess.js}`, `config/env.js`: self-hosted handler, bcrypt, own JWKS, live session joins, issuer/audience and short-lived session-bound claims |
| Recent authentication | `reauthenticate.js`, `accountSecurityAssurance.js`, `recoveryMfa.js`, `mfaChallenge.js`: provider/session-bound password, OAuth and MFA proofs; JWT issuance time is not a replacement |
| Provisioning/profiles | `infra/neon/better-auth-integration.sql`: triggers on self-hosted user tables create/update canonical identities, links and profiles; managed registration will not invoke these triggers automatically |
| Ownership/RLS | `infra/neon/identity-bootstrap.sql`, `better-auth-integration.sql`, `backend/src/data/browserData*`: canonical UUID and transaction-local claims; `continua_session_meets_mfa()` currently requires the self-hosted session tables |
| Entitlements/payments | Existing profile subscription fields, subscriber checks, billing-owner SQL and Paystack routes remain tied to canonical owners; never inherit an old subscription by matching email |
| Streams/media | Private snapshot/WebSocket handlers and `infra/cloudflare/{private-events.mjs,media.mjs}` need the same verified mapped owner and revocation rules |
| Account deletion | `backend/src/data/deleteAccount.js`: currently deletes own auth/application rows atomically and queues owner media cleanup; managed deletion needs an explicit lifecycle that cannot touch preserved legacy owners |

## Fresh identity/provisioning design

Keep all existing `app_identity.users.id` values and rows intact. A fresh managed
subject receives a **new canonical application UUID**, a new profile, Free
entitlement and default settings. It does not inherit old portfolios, watchlists,
payment references, subscriptions, handles or private files merely because its
email matches an old account.

Use a private mapping with an exact issuer/branch namespace plus immutable managed
subject as the unique key, referencing the new canonical UUID. Provision in one
transaction with uniqueness/concurrency guarantees. Verify the managed credential
first; do not accept an owner ID, entitlement, issuer or mapping supplied by the
browser. Derive verified email/profile fields from the validated provider session.
Record required legal/onboarding acknowledgements before granting application
access. Keep paid fields under the existing billing-owner guard.

**Confirmed schema collision:** `application_identity_email` currently enforces
global uniqueness of non-deleted email values. It would reject a new canonical
identity using an old account's email. A reviewed, issuer/provider-scoped identity
namespace and corresponding uniqueness rule are required in staging. Preserve
the old row and email; do not mark it deleted or relink it to evade the index.
Profiles also have unique handles and unique user IDs; create a fresh unique
handle without reclaiming the old one. This schema work has not been applied.

New-account subscription recovery must be a separate, explicitly approved process
proving ownership of both identities and relevant payment records. A fresh email
verification alone does not authorize access to the old application owner.

## Decisions required before implementation

1. **MFA policy:** retain the existing requirement and wait for a supported
   equivalent, or explicitly approve staging without TOTP MFA for new managed
   accounts. Zero currently enrolled users does not itself approve removing the
   feature. Verified email and Google sign-in are not being described as
   substitutes for TOTP MFA.
2. **Email changes:** explicitly approve making email-address changes unavailable
   for new managed accounts, rather than claiming the old both-address workflow
   is preserved. No insecure email-change workaround is proposed.
3. **Missing test account:** confirm whether the deletion associated with the
   19:34 receipt was intentional. Preserve the historical/current evidence and
   do not automatically restore or transfer that owner.

Approving either feature exception is not blanket permission to relax session
verification, recent-authentication requirements, authorization or rate limits.
Unsupported sensitive actions must stay unavailable until their secure
replacement is verified. Production cutover requires separate explicit approval.

## Conditional staging sequence after those decisions

Use an isolated branch of existing project `orange-bird-13151544` and verify its
display name, database and Auth URL against the Console before provisioning;
production remains `br-noisy-block-b4z5yxup` / `neondb`. Do not create another
project or overwrite an unrelated branch. Use dedicated staging origins, secret
configuration and test email delivery, with schedules, payments and collectors
disabled. Do not expose production callback trust or cloned auth secrets.

Implement the approved managed-provider adapter behind an explicit staging-only
selection. Keep React UI/branding, Render application APIs, Cloudflare hosting,
Paystack, R2 and Redis. Use the supported Neon SDK for registration, login,
verification, reset, logout and persistence. Keep the self-hosted implementation
and its tables available for rollback. No new backend runtime is justified; reuse
the existing Node/Express compatibility service and SQL ownership model, without
changing the separate Go/Python rewrite or its cutover gates.

Render must verify the pinned managed JWT signature/algorithm/issuer/audience and
expiry, plus a live provider session/revocation proof, then resolve the canonical
mapping. The managed fifteen-minute JWT and default claims cannot be passed
unchanged into the old session/MFA SQL. Same-origin proxy/cookie behavior and
Safari limitations require real staging tests; the roadmap and JWT guide still
give conflicting standalone-architecture guidance. Reject unmapped subjects and
do not enable a direct Data API path that bypasses the application gates.

After an approved staging registration, check the managed row **and the Users
dashboard on that staging branch**, then the canonical mapping/profile and Free
entitlement. Never register a production user solely to populate the dashboard.
Test verification, reset single use/expiry, login/logout/reload, expiry/revocation,
protected routes, concurrent idempotent provisioning, portfolio/watchlist creation,
new Free entitlements, Google callbacks, cross-user HTTP/socket/media isolation,
forged owner fields and legacy-data inaccessibility to a same-email new user.
Compare baseline counts/hashes and explain only intended staging writes.

Before a separately approved production switch: complete fresh full backup/restore
verification, current-user reconciliation, security and quota gates, exact
production redirects/custom SMTP, staged configuration review and a rollback
rehearsal. Keep old data and auth tables. After any new managed/application write,
rollback must reconcile new registrations and account changes; it cannot blindly
restore an old database or relink new accounts to old owners.

The full managed capability analysis, candidate file/environment changes and
acceptance matrix are in
[MANAGED_AUTH_ASSESSMENT_20261024.md](MANAGED_AUTH_ASSESSMENT_20261024.md).
Its password-continuity requirement is superseded by this fresh-registration
instruction; its unresolved security and session issues remain applicable.
