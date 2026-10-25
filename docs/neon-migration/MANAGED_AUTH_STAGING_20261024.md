# Managed Auth staging implementation — 24 October 2026

Status update, 25 October: the owner approved production cutover after staging
passed. See [the production record](MANAGED_AUTH_PRODUCTION_20261025.md) for the
current authorization and deployment status. This document records the earlier
staging state. Final staging validation included two verified users, successful
Google sign-in with Continua's own OAuth client, 589 backend tests, 174 frontend
tests and 37 edge tests. The deletion adapter remains disabled with mock tests only.

## Scope and approval

The owner approved fresh registration, staging without TOTP MFA, unavailable
email changes, and mandatory email verification. Existing account credentials
are not imported into managed Auth. Production cutover remains a separate gate.
The existing Go/Python rewrite is separate; this candidate uses plain JavaScript,
the existing Express compatibility runtime, SQL and the existing React UI.

This report supersedes the initial read-only assessment's statements about no
installed dependencies or staging users. It does not mark production migrated.

## Exact deployment state

| Component | Current state |
| --- | --- |
| Project | Existing `continua`, `orange-bird-13151544` |
| Production | `br-noisy-block-b4z5yxup`; existing self-hosted Better Auth remains selected |
| Isolated candidate | `br-lively-paper-b4oli11a`, `continua-managed-auth-staging-20261024` |
| Candidate database | `neondb`, `ep-purple-salad-b4qr5err.c-6.us-east-2.aws.neon.tech` |
| Candidate Auth URL | `https://ep-purple-salad-b4qr5err.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth` |
| Frontend/Render production | No managed-provider configuration or candidate deployment applied |
| Managed users | One new, owner-approved staging fixture, verified through the delivered email and visually confirmed in Neon Console |
| Legacy accounts | Eight in the historical source archive; seven in the current production snapshot and staging clone |

The missing historical account has a pre-existing deletion receipt, as detailed
in `FRESH_REGISTRATION_READINESS_20261024.md`. This work did not delete or restore
it. No old passwords, sessions or hashes were copied into `neon_auth`.

The staging compute is capped at 0.25 CU. No paid plan, new project, always-on
service, payment charge, production identity replacement or data transfer was
enabled. Free-plan quota suitability does not establish security-feature parity.

## Implemented candidate

- Pinned official `@neondatabase/auth@0.7.0-beta` server toolkit using its
  documented Express RequestContext pattern. The existing browser compatibility
  transport calls this same-origin BFF; this is not a new self-hosted Auth server.
- Host-only Secure HttpOnly cookies, explicit origin/header gates, existing edge
  gateway, server-side Turnstile checks and bounded upstream work. Local SDK
  session-data cookies are excluded from authentication decisions.
- Ed25519 JWKS verification pinned to the exact managed issuer/audience and
  fifteen-minute maximum lifetime, plus a fresh managed session check on every
  protected request. JWT hashes bind to local sessions; encrypted opaque cookies
  permit backend revocation checks without forwarding browser cookies to data APIs.
- New canonical UUID per verified issuer/subject. Transactional advisory locking
  makes provisioning idempotent. Profiles start Free with no paid expiration;
  default preferences are inserted. Email matching never retrieves an old owner.
- A local binding can first be established only by an authorized Continua
  password sign-in or verified OAuth completion. An arbitrary direct managed
  cookie cannot bypass the application's bot/registration gates through restoration.
- One-use, server-issued OAuth intents carry signup consent and require an SDK
  verifier exchange. New Google users without signup consent remain unmapped.
- Existing SQL ownership policies receive server-resolved canonical claims;
  managed session checks are added alongside the original self-hosted MFA branch.
  Legacy source rows are not rewritten. A separate managed-email uniqueness
  predicate permits fresh registration without attaching old account data.
- Existing UI retained; managed mode explicitly explains the approved MFA and
  email-change limitations. Unsupported endpoints return explicit errors.
- Startup is hard-restricted to the isolated branch and refuses production's
  database, Auth URL and public origin. Production defaults remain `better-auth`.

The package remains beta and needs a pinned-version upgrade/retest policy. SDK
dependency overrides retain the repository's patched Better Auth versions; they
must be reviewed on any SDK upgrade.

## Password reset finding and application mitigation

The real staging test found that a successful managed reset left pre-reset
sessions valid at the provider. Checking `getSession()` alone was insufficient.

The candidate additionally calls the official SDK's `listAccounts()` and checks
the credential account's server-returned `updatedAt` against session `createdAt`.
Older sessions fail closed, are signed out upstream, and their application
binding is revoked. Neither managed password columns nor credential hashes are
read by the runtime. Missing, invalid or future timestamps deny access.

Repeated live tests passed after this change: both pre-reset sessions were
rejected; previously retained cookies could not mint replacement access tokens;
the reset token could not be replayed; the old password failed; the new password
retained the canonical profile and data. This is an application mitigation, not
a claim that Neon's default reset behavior now revokes all provider sessions.
Timestamp semantics must remain a regression gate on provider/SDK upgrades;
vendor confirmation of a native revoke-on-reset option is still desirable.

Reset email receipt was confirmed by the owner. For the automated endpoint test,
the single-use reset token was read privately from the isolated fixture's
verification record. That test did not exercise the browser's reset-link page.
No token was printed, committed, or used to reset a legacy/production account.

## Live checks completed

| Check | Result |
| --- | --- |
| Managed registration | New row in the candidate `neon_auth."user"`; no session before verification |
| Email delivery/verification | Brevo IP approvals were required; resend succeeded and owner clicked the link |
| Password login | SDK login, signature validation and live session validation passed |
| Provisioning | Distinct canonical UUID, one Free profile, default preferences |
| Restoration/idempotency | Existing cookie restored the same owner without duplicate profiles |
| Logout | Old access token rejected immediately; logged-out cookie could not restore |
| Password reset | Changed only the staging fixture; replay, old-password and pre-reset-session checks passed after mitigation |
| Portfolio/watchlist | Own holding, folder and watch entry created through the protected HTTP data router |
| Cross-user ownership | Old owner's private watchlists inaccessible; forged portfolio owner rejected |
| Entitlement | Self-upgrade to Plus rejected; profile remained Free |
| Unauthenticated requests | Mutation and post-logout protected requests rejected |
| Preservation | All 98 tables matched after schema application; final comparison also matched every pre-existing row after excluding only the new test owner's rows |
| Dashboard | The signed-in Console showed the staging branch and exactly one managed test user; production still showed no managed users |
| Regression | 578 backend tests passed (18 skipped), 170 frontend tests passed, 37 gateway tests passed; backend/frontend type checks and frontend build passed |

Ignored receipts live under `.qa-artifacts/neon-managed-assessment/`. They contain
sanitized outcomes; credentials and the fixture password remain in the protected
temporary operator directory, never in the repository.

## Remaining gates — do not call these completed

1. Full browser tests of Secure cookies, reload, protected routes, reset-link
   handling, multiple tabs, OAuth/logout races and Safari behavior.
2. Google OAuth configuration with the application's own client, exact staging
   callback, verified state/nonce/legal proof and sensitive-operation assurance.
   The candidate OAuth code is not an end-to-end Google test result.
3. Confirm the Console remains aligned with the selected environment during any
   later deployment. Staging visual confirmation is complete, with a saved screenshot.
4. Managed account-deletion parity. The existing deletion handler still targets
   self-hosted identities and fails closed for a managed account. Do not claim
   this feature is ported or retire the old handler.
5. Managed scheduled-maintenance/cleanup review, resource/load measurements,
   strict sender-IP stability and fresh Free-plan consumption checks. Staging
   must keep schedules, collectors, live payments and production R2 bindings off.
6. Independently recoverable backup key, complete database restore rehearsal,
   final account reconciliation and exact production callback/environment review.
7. Separate explicit production approval after all acceptance gates pass.

## Configuration changes required for review

Backend candidate variables: `AUTH_PROVIDER=neon-managed`,
`NEON_AUTH_STAGING_ENABLED=true`, `NEON_AUTH_BRANCH_ID`, `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_SESSION_KEY`, staging `DATABASE_URL`,
`AUTH_PUBLIC_ORIGIN`, `ALLOWED_ORIGINS`, and server Turnstile configuration.
Cookie-signing and AES-GCM keys must be independently generated and retained
securely across candidate restarts. Never put them in a Vite variable.

Frontend candidate build: `VITE_AUTH_PROVIDER=neon-managed`, correct same-origin
API configuration and the appropriate public Turnstile site key. The frontend
keeps access JWTs in memory and provider cookies HttpOnly.

Cloudflare candidate: isolated backend origin and server API/edge credentials;
managed staging provider/branch flags; isolated assets and rate limits. No
production cron, R2 bucket, or backend override is part of this staging work.
Neon config: mandatory verification, custom SMTP, exact trusted origins, own
Google OAuth credentials/callback. Disable localhost only for a future reviewed
production configuration, not this local candidate.

Before production, the hard staging-only guard itself must be replaced by an
explicitly reviewed production configuration gate. Do not weaken it ad hoc.

## Rollback

Before cutover, rollback means leaving the production frontend/Render provider
and database untouched; the isolated branch and candidate code can be retained
for diagnosis. No database restore is needed.

For a future approved cutover, save exact frontend/Render versions, provider
settings, SQL function/index definitions and protected secrets before switching.
Keep all old Auth tables and old canonical IDs. On failure, freeze new managed
registration, restore the previous application deployment/configuration and
review writes made since cutover before reopening access. Preserve new managed
identities, mappings, user-owned rows and billing records. Reconcile new users
explicitly; never relink by email, transfer subscriptions automatically, or
overwrite the database with the historical archive.

## Primary references

- [Official framework-adapter toolkit](https://github.com/neondatabase/neon-js/blob/main/packages/auth/BUILDING-AN-ADAPTER.md)
- [Managed roadmap and limitations](https://neon.com/docs/auth/roadmap)
- [JWT verification](https://neon.com/docs/auth/plugins/jwt)
- [Email verification](https://neon.com/docs/auth/guides/email-verification)
- [Production configuration](https://neon.com/docs/auth/production-checklist)
- [Password reset](https://neon.com/docs/auth/guides/password-reset)
- [User management](https://neon.com/docs/auth/guides/user-management)
