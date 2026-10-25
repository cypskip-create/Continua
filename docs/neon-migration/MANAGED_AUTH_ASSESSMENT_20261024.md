# Managed Neon Auth assessment — 24 October 2026

This is the initial password-preserving, read-only assessment. The later
fresh-registration approval supersedes its credential-continuity requirement.
Current implementation, approvals and staging evidence are recorded in
[MANAGED_AUTH_STAGING_20261024.md](MANAGED_AUTH_STAGING_20261024.md).

## Decision

**Do not switch production.** Moving the database-hosted identities from
Continua's self-hosted Better Auth to Neon's managed Better Auth is not currently
a supported, feature-preserving migration for this application. The blockers are
credential import, MFA, verified email changes and session-security parity.
This assessment prepares a conditional implementation and staging plan, not a
production migration or an importer.

During that initial investigation, no dependencies were installed, provider settings changed, managed identity
records created, password hashes copied into managed tables, or passwords reset
for this investigation. The separately requested chart/sign-out fixes retain the
existing self-hosted provider and are not a managed Auth cutover.

## Evidence and SDK inspection

Official guides were retrieved on 24 October from Neon, including the roadmap,
Supabase migration, JWT, production, React, user management, reset, verification,
OAuth, branching and plan documentation. Official SDK source was inspected at
`neondatabase/neon-js` commit `8dc8114f1390613ed7d77e8eeb3f46801ff5a0da`.
The npm `latest` metadata returned `@neondatabase/auth@0.7.0-beta`; its published
archive was read as static text, not installed or executed. Source on the main
branch and published artifacts are distinct evidence, not assumed identical.

The published adapter fixes its client plugin list. Its Supabase adapter exposes
MFA as undefined. The inspected source excludes caller-supplied plugins from
adapter options, and the server endpoint map comments out email changes.
Installing the upstream Better Auth MFA plugin in the browser cannot add a
plugin to Neon's hosted server.

Documentation is not entirely consistent: the roadmap marks separate
frontend/backend deployments unsupported, while the JWT guide documents
cross-domain API authorization. The reset guide warns that the Supabase-style
reset helper is not fully supported, while the SDK source implements it through
`requestPasswordReset`, and the server map exposes reset methods. These require
a pinned-version staging test and vendor clarification; method presence is not
proof of a supported deployed flow.

Sources: [SDK](https://github.com/neondatabase/neon-js/tree/8dc8114f1390613ed7d77e8eeb3f46801ff5a0da/packages/auth),
[roadmap](https://neon.com/docs/auth/roadmap),
[reset guide](https://neon.com/docs/auth/guides/password-reset).

## Compatibility matrix

| Requirement | Managed service finding | Continua impact |
| --- | --- | --- |
| Existing bcrypt credentials | No documented supported self-hosted import; current Supabase migration guide explicitly excludes password-user migration because of hash differences | Eight original passwords cannot be promised to work after switching |
| Original managed user IDs | No verified documented import API preserving supplied UUIDs was established | Require vendor confirmation or an authenticated subject-to-original-UUID mapping |
| Email/password registration | Supported | Application still needs its legal-acknowledgement and provisioning gates |
| Google sign-in | Supported with production OAuth credentials | Existing account linking and legal gates need independent verification |
| TOTP MFA and recovery challenges | MFA remains on the roadmap | Existing MFA, OAuth step-up and recovery protections cannot be ported as supported managed features |
| Verified email change | User-management guide explicitly says email changes are unsupported | Continua's both-address confirmation flow loses parity |
| Email verification | Supported; opt-in, codes or links | Enable explicitly; links require custom email delivery configuration |
| Password reset | Supported via managed flow; SDK/helper documentation differs | Prove selected SDK methods, single use, expiry, redirects and session revocation |
| JWT verification | Ed25519 JWKS verification supported | Different issuer/audience, 15-minute tokens and no custom claims |
| Immediate logout/session revocation | JWT verification alone does not prove a live session | Preserve an online session check; do not accept a revoked-session JWT until expiry |
| Custom hooks/plugins | Not a bring-your-own-server plugin surface | Existing assurance, registration, CAPTCHA and recovery hooks require another design |
| Frontend/backend hosting | React supported; standalone architecture documentation conflicts with JWT guide | Prove same-origin cookie/proxy transport and external API authorization before implementation |

The [current managed migration guide](https://neon.com/docs/auth/migrate/from-supabase)
applies directly to these credentials' origin: moving bcrypt hashes into a
self-hosted Better Auth schema did not change their algorithm. Upstream
Better Auth's configurable bcrypt verifier does not establish that Neon's
managed service accepts that verifier. The older Stack Auth import API describes
a different product. Hashes cannot be converted to another password algorithm
without the password; re-hashing the bcrypt string would break login.

Feature sources: [user management](https://neon.com/docs/auth/guides/user-management),
[email verification](https://neon.com/docs/auth/guides/email-verification),
[JWT](https://neon.com/docs/auth/guides/plugins/jwt).

## Identity and application-data preservation

The earlier read-only audit confirmed eight source/target UUID/email/bcrypt
matches, eight profiles, sixteen portfolio rows, thirty-three watchlist rows and
nine folders. Subscription plan/expiry fields matched for all eight users, with
no ownership orphans in those tables. The final migration receipt matched 102
application tables at cutover. See [AUTH_AUDIT_20261024.md](AUTH_AUDIT_20261024.md).
Those checks are baseline evidence; take a fresh inventory before any later move.

Keep `app_identity.users.id` as the canonical application UUID. Keep all profile,
portfolio, watchlist, subscription and payment owner references attached to that
UUID. Do not rewrite those foreign keys to a newly registered managed subject.

If Neon offers a supported import preserving the UUID, verify every imported
ID against the manifest. Otherwise design an application-owned, private mapping
keyed by **exact managed issuer plus immutable subject**, pointing to the
original UUID. Uniqueness must prohibit two subjects for the same migrated owner
in one issuer, or a subject mapped to two owners. Unmapped/ambiguous subjects
must be denied until provisioning or migration establishes ownership.

A reliable mapping is technically possible, but it does not solve the missing
credential import. Populate it only from a supported vendor import manifest or
a separately approved flow proving both the existing identity and the new managed
identity. An email match, even a verified email, is not the sole linking proof.
Retain the existing profile and premium entitlement rather than making a second
account. Include the existing Google-linked account in the inventory; encrypted
OAuth tokens from the old server cannot simply be copied under new secrets.

Do not enable the Neon Data API as a shortcut: its raw managed `sub` would not
automatically equal the canonical application UUID, and its helpers/policies
must not replace Continua's existing `auth` compatibility functions unnoticed.

## Secure Render verification design, conditional on the blockers being resolved

The managed JWT contract is not Continua's current JWT contract. Do not merely
replace a JWKS URL in `verifyAccess.js` or extend its accepted lifetime.

1. Pin the branch's exact HTTPS Auth base URL from the existing project. Derive
   the public JWKS location from that trusted configuration, never from token
   headers or a browser-provided URL. Pin issuer and audience to the observed,
   documented branch contract; allow EdDSA/Ed25519 only. Enforce expiry,
   not-before where present, sensible issued-at/skew, token length and key IDs.
   Cache JWKS with bounded refresh and timeouts; reject unknown/unverifiable keys.
2. Obtain browser sessions through a tested same-origin proxy/server-adapter
   path. Render must validate the opaque managed session online, compare its
   user with the signed token subject, check current account status and resolve
   the private canonical UUID mapping. Never send the Neon management API key
   to the browser or accept a JSON user object as authentication.
3. Preserve live revocation rather than treating a valid fifteen-minute JWT as
   evidence that its issuing session still exists. A cookie-less bearer request
   cannot pass the live-session requirement without a separately designed,
   trusted binding/introspection mechanism. The documented example JWT does
   not provide Continua's `session_id`, `aal` or `amr` assurance contract.
4. Build request-local canonical claims after verification: original UUID, fixed
   application role, and independently verified session/assurance. Provider
   admin roles do not grant SQL service-role or premium entitlement. Keep
   transaction-local RLS claims, role reset and billing-owner guards unchanged.
5. Replace the own-table session/MFA SQL helper deliberately. Currently
   `public.continua_session_meets_mfa()` joins the self-hosted session and
   assurance tables; managed sessions would fail it even if IDs matched.
   JWT issuance time must not become proof of a recent password or MFA check.
6. Rework private WebSocket admission and periodic/session-revocation checks
   together with HTTP auth. Retain owner-only rooms and snapshots. Do not let
   a socket retain access after logout, deletion, entitlement loss or revocation.

MFA and recent-password proof remain unresolved under managed service support.
An application-owned second factor would need a separate, explicitly reviewed
architecture that gates every data/media/WebSocket path; an unguarded managed
session or direct Data API must not bypass it. It is not a feature-preserving
drop-in migration and is not implemented here.

## Exact change surface if migration later becomes supported

| Area | Required work |
| --- | --- |
| `app/src/integrations/continua/identityClient.js`, `browserClient.ts` | Add a provider-specific adapter using the pinned Neon SDK; keep the existing data-client interface and memory-only access tokens. Prove cookie transport, restoration, expiry, errors and sign-out deduplication. Do not replace the whole data layer with Neon Data API. |
| `app/src/hooks/useAuth.tsx`, `pages/Auth.tsx` | Adapt session events and new-user provisioning; preserve legal/age acknowledgements, account separation and cache cleanup. |
| `components/security/*`, `pages/Settings.tsx` | Reimplement supported verification/reset methods and callbacks; keep MFA/email-change controls blocked from cutover until equivalent security exists. Do not silently remove them. |
| `backend/src/auth/runtime.js`, `verifyAccess.js`, `identityRoutes.js`, `config/*` | Add explicit managed-provider selection, JWKS and live-session verifier; retain the current provider as rollback. Remove self-hosted handler mounts only at a separately approved cutover. |
| `backend/src/data/*`, subscriber checks, private streaming, media verification | Consume canonical mapped identity and current assurance; preserve every owner/entitlement rule. Rework account deletion into an idempotent, fail-closed lifecycle if it crosses the managed API boundary. |
| `infra/cloudflare/identity.mjs`, `worker.mjs`, private-events/media adapters | New allowlisted managed proxy/cookie rules and callback handling; retain CSRF/origin checks, no-store, safe redirects, bounded bodies and separate sign-out admission. Test Safari/third-party-cookie behavior. |
| `infra/neon/*` SQL | Add mapping and controlled provisioning without overwriting application rows; adapt assurance functions and profile-sync triggers. Existing triggers fire on self-hosted tables, not on managed registrations. Confirm managed schema access/contracts before relying on them. |

Proposed configuration names below are **application configuration to implement**,
not a claim that the existing code accepts them today:

- Frontend: explicit `VITE_AUTH_PROVIDER=neon-managed` and
  `VITE_NEON_AUTH_URL=<exact tested branch Auth URL>` where using the documented
  direct SDK path. A same-origin server-adapter design instead pins its public
  proxy URL plus any SDK-required OAuth configuration. Never put secrets in Vite
  variables. Do not concatenate a second `/auth` segment onto the Console URL.
- Render: explicit `AUTH_PROVIDER=neon-managed`, `NEON_AUTH_BASE_URL`, pinned
  `NEON_AUTH_JWKS_URL`, `NEON_AUTH_ISSUER`, `NEON_AUTH_AUDIENCE` and a separate
  proxy-cookie secret if required by the selected server toolkit. `DATABASE_URL`
  stays on the same project/branch/database. Keep existing secrets privately for
  rollback; retire them only after a proven reconciliation period.
- Worker: matching explicit provider mode and fixed backend/proxy target.
  Existing gateway/API keys remain server-only. No management credential is
  needed for routine public-key JWT verification. Any provisioning credential
  must be narrowly protected on the server.
- Neon Console: exact trusted production/staging origins; verified custom SMTP
  and sender; required email verification; own Google OAuth client; production
  localhost disabled; reviewed account linking and email/reset settings.
- Google: authorized redirect URI becomes
  `{NEON_AUTH_BASE_URL}/callback/google` for the chosen branch. This is different
  from the application's post-login destination
  `https://continua.cypriankiprop41.workers.dev/auth`. Keep the old callback
  registered during rollback readiness; add staging separately. Verification and
  recovery redirects must point to explicit implemented app routes, consume
  tokens safely, and avoid logging tokens in URLs.

No new implementation runtime is selected while compatibility is blocked.
Any later proposal should reuse the browser React application, existing deployed
JavaScript compatibility backend and SQL ownership model. It must separately
respect the repository's Go/Python rewrite and cutover gates, rather than adding
a new TypeScript backend or declaring the native migration complete.

Sources: [React quick start](https://neon.com/docs/auth/quick-start/react),
[OAuth](https://neon.com/docs/auth/guides/setup-oauth),
[production checklist](https://neon.com/docs/auth/production-checklist).

## Free plan and expected usage

Neon's current plan guide lists **60,000 MAU**, **100 CU-hours/project/month**,
**1 GB Postgres storage/project**, **5 GB network transfer/project** and
**10 branches/project** on Free. Eight users fit the Auth MAU allowance easily.
This does not establish the application's total compute, transfer, storage or
mail usage: collectors, SQL live-session checks and staging share resources.
Measure current usage and staging headroom before provisioning.

Free cannot supply features the managed service does not implement. An upgrade
is not documented as a way to enable the missing MFA/email-change/import path.
Production requires a custom SMTP provider; Continua's existing Brevo Free setup
is a candidate, but Neon-origin delivery, TLS/port support, provider restrictions
and the current application daily-send budget must be tested. Moving delivery
out of Render would otherwise bypass its application-specific mail cap.
Do not promise zero email costs or enable a paid plan automatically.

Source: [current plan guide](https://neon.com/docs/introduction/plans).

## Staging plan, with explicit stop gates

1. **Resolve compatibility first.** Obtain a supported Neon procedure covering
   self-hosted bcrypt import, UUID preservation or mapping, existing verification
   status/Google links, MFA and verified email changes. Also resolve session
   revocation and SDK/architecture ambiguities. No importer or identity mutation
   should be prepared as an executable migration until these gates pass.
2. Capture a new encrypted, recoverable snapshot of current **Neon production**,
   including all post-Supabase-cutover writes. Inventory original eight users
   plus any newer users, profile/owner links, credentials' algorithm labels,
   verified status, factors, subscriptions, payment history and provider links.
   Keep hashes and emails out of logs and Git. Record counts and exact row hashes.
3. Use an isolated child branch of existing project `orange-bird-13151544`,
   separate from production `br-noisy-block-b4z5yxup`; verify default database
   `neondb`, endpoint and branch Auth URL. Cloning `app_identity` does **not**
   import those users into an empty `neon_auth` schema. Do not overwrite the
   existing staging branch or create a paid resource automatically.
4. Disable cloned writers, schedules, payments and real mail on staging. Treat
   cloned provider secrets/sessions as sensitive; prevent production callbacks
   and cookies from being trusted there. Use a staging mail sink and dedicated
   callback configuration before any approved managed import is exercised.
5. Once a supported method is approved, perform one guarded, repeatable staging
   migration with a manifest mapping every original identity. Preserve all
   application UUIDs and owner rows; do not create substitute users or profiles.
   Resolve collisions explicitly. Compare all affected rows and account states.
6. Run the test matrix below using isolated fixtures and voluntary existing-user
   checks without collecting plaintext passwords. If original-password login
   cannot pass, the no-reset migration has failed; stop rather than weakening it.
7. Prepare versioned provider-specific builds/configuration, verified backups,
   receipts and an ordered maintenance/cutover runbook. Only after all security,
   capacity and continuity gates pass, present the concrete changes for approval.
   Production switching remains a separate user approval.

No staging branch, managed identity or reset was created during this assessment.
Source: [auth branching](https://neon.com/docs/auth/branching-authentication).

## Required acceptance tests

| Test | Required observable result |
| --- | --- |
| Eight existing password users | Original passwords work with the expected canonical UUID; no second profile or lost verification status |
| Data reconciliation | All owned profiles, portfolios, watchlists, folders and subscriptions remain attached to the same canonical owners; snapshot/hash differences explained |
| Existing Google account | Correct original owner is reached; no email-only account takeover, duplicate or lost password credential |
| Registration | Unverified access denied; verification required; server-confirmed legal/age onboarding; exactly one new canonical profile and no caller-controlled paid plan |
| Reset | Known/unknown-email responses do not enumerate accounts; approved staging mail only; single use, 15-minute expiry, safe redirects; other sessions revoked as required |
| MFA and recovery | Password, OAuth and reset paths cannot bypass enabled TOTP; pending challenges/reload/cancel/lockout behave correctly |
| Email change | Existing two-address confirmation and recent-auth requirements remain effective; unsupported handler is a failed gate |
| Browser sessions | Login/reload/expiry/multiple tabs/Safari cookie policy work; one sign-out request for repeated clicks; failure visible; successful sign-out stays signed out |
| JWT rejection | Forged signature, wrong algorithm/key/issuer/audience, staging-to-production token, expiry and anonymous token all rejected |
| Live revocation | A previously valid unexpired JWT stops granting access after its session is revoked; HTTP, media and sockets agree |
| Authorization | Each user can access only permitted owned rows; forged owner/body/filter, other-user room, private media and premium access fail |
| SQL boundaries | Mapped UUID reaches LOCAL claims only after verification; SET-role boundaries restore on commit/error; no managed-subject shortcut bypasses RLS |
| Deletion/lifecycle | Deactivated/deleted user denied immediately; retries cannot duplicate deletion/provisioning; remote outage cannot restore access |
| Capacity/outages | Auth/DB/JWKS/mail outages fail safely with retryable UI; quotas and free-host memory/latency measured |
| Rollback rehearsal | Switching a staging deployment back preserves original login and all writes made during the test interval |

## Rollback and user-facing effects

Before production ever accepts a managed-auth write, rollback is the old tested
release plus its original provider configuration on the **same current Neon
application database**. Keep that provider and its secrets available. Do not
delete either auth schema, reset users, or restore an old snapshot over live data.

After cutover writes, freeze identity and relevant application writers before
rollback. Capture both auth systems and all new application writes. Reconcile
new registrations, password/email changes, verification, account links, MFA,
deletions, subscriptions and payment events against the canonical mapping.
Original bcrypt copies become stale after a managed password change. New managed
credentials may not be importable back into the self-hosted verifier. No complete
automatic reverse migration is certified; prefer rolling forward on the active
provider if reconciliation cannot preserve credentials and account state. Never
reopen an old deleted or revoked account during rollback.

Current users should experience **no changes now**, because no switch is planned.
A future supported provider switch should assume a fresh sign-in: old cookies
and sessions are not documented as portable. Without a supported bcrypt importer,
managed adoption would require a separately approved credential-enrolment or OAuth
transition; that is a user-visible migration, not transparent password continuity.
MFA removal or loss of email-change capability is an unacceptable regression,
not an unavoidable change to impose on users. Recovery email branding/routes may
change only after staging delivery and privacy checks pass.

## Next decision

Retain self-hosted Better Auth on Render. Revisit managed Auth after Neon confirms
the missing import and security contracts. The eight accounts do not need to be
created again simply to populate the managed dashboard. No production-switch
approval is requested because a fully compatible implementation is not currently
available to approve.
