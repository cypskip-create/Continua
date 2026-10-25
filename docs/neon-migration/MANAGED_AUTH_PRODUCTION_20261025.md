# Managed Auth production cutover — 25 October 2026

The owner explicitly approved production cutover after successful staging tests,
then separately approved transferring the existing Google OAuth secret and Brevo
SMTP credentials to the existing production Neon Auth service, and saving its
Google callback. Earlier staging-only holds are superseded by this approval.

## Configuration and preservation

- Project: `orange-bird-13151544` (`continua`).
- Production branch: `br-noisy-block-b4z5yxup`; database: `neondb`.
- Managed endpoint: `https://ep-nameless-voice-b4ygobrp.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth`.
- Public application: `https://continua.cypriankiprop41.workers.dev`.
- Backend: existing `continua-backend` Render service; no new paid service.
- Mandatory email verification, existing Brevo sender, existing application Google client.
- Fresh registration only: new managed subjects receive new canonical UUIDs and
  Free profiles. Matching an old email never links or transfers old data or paid entitlements.
- Legacy credentials, UUIDs, profiles, portfolios, watchlists and subscriptions remain intact.
- Historical source archive contains eight users. Current production has seven;
  the eighth has a pre-existing deletion receipt, documented in the readiness report.
- Managed account deletion remains disabled. Its implementation was approved for
  code preparation and mock tests only. MFA and email changes remain unavailable
  in managed mode under the previously approved feature scope.

Immediately before cutover, a fresh encrypted identity backup was verified by
decryption and table hashes (SHA-256
`4458eeb5ee4e55115951a9ff44242675d57cc551efdb523375a7285fa629aeae`).
The production schema transaction compared 52 existing application/identity
tables before and after: every row count and hash matched. No password hash was
copied into `neon_auth`. Original function/index definitions and environment
snapshots are retained in the protected local migration directory.

## Validation

Staging regression: 589 backend tests passed (18 skipped), 174 frontend tests
passed, 37 edge tests passed; both type checks and frontend build passed.
Production additions: eight focused runtime tests and fourteen edge identity,
maintenance and provider tests passed; backend type check passed.
Live staging tests covered verified login, registration, reset and old-session
rejection, logout/reauthentication, Google sign-in with the application client,
Free entitlements, owner isolation and preservation of legacy records.

## Deployment and rollback

Deployment completion must be verified separately from configuration: commit SHA,
Render deployed SHA, Worker version and public smoke tests belong in the final
cutover receipt. Never infer a completed deployment from this document alone.

For rollback, restore the protected previous Render environment with
`AUTH_PROVIDER=better-auth`, redeploy the previous known-good SHA
`0b2ea1b9ffb3aa86ee01e64949f3867b0973f334`, and restore the prior Worker version
and frontend assets. Retain the new managed tables and managed identities;
do not delete them or roll the entire database back over newer application data.
The shared SQL authorization function retains the legacy session path.
Existing Google callbacks remain for rollback. Fresh managed users may need to
wait during a rollback; never silently substitute or merge their legacy account.

The production switch ends old application sessions. Existing users must
register afresh under the approved fresh-registration policy; their preserved
historical data is not automatically attached to the new account. Passwords,
email verification and Google identity verification remain handled by Neon.
