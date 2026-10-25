# Managed account deletion — proposal only, 25 October 2026

A default-disabled deletion adapter and seven mock tests have been prepared.
No live deletion has been executed. Managed deletion remains unavailable while
its configuration flag is false, including during the approved production cutover.

The owner subsequently approved **disabled code and mock tests only**. That
approval permits preparing the adapter behind a default-off configuration flag.
It does not authorize enabling the flag or any live deletion. This narrow scope
must remain enforced in the implementation and acceptance report.

The migration requires account-settings parity. Neon's live OpenAPI documents
`deleteUser`; a deliberately incorrect-password probe returned 404 and preserved
the staging fixture. That negative probe does not establish successful deletion.

Automatic approval review rejected adding an executable managed deletion handler
because it could permanently erase financial/application records without an
explicitly approved deletion-parity change. This document is a non-executable
review of the intended behavior, not a workaround or an authorization record.

## Proposed implementation approval

Approve preparing a **disabled-by-default** managed deletion adapter and mock
unit tests only. Do not execute account or financial-data deletion. No live
deletion test, production enablement or destruction of staging records is covered
by this approval; each remains a separate explicit decision.

The default self-hosted handler must remain unchanged. Managed mode must reject
deletion until a separate enable flag is explicitly authorized and configured.
The candidate's production-host/branch restriction also remains in force.

## Required behavior

1. Require a verified application session and exact canonical owner confirmation.
2. Under a row/advisory lock, require the issuer/subject mapping and canonical
   identity to be active and `source_provider='neon-managed'`. Never resolve the
   target by email. Never select a legacy Supabase/self-hosted identity.
3. Require fresh server-recorded password or verified OAuth proof. JWT issuance
   time, a client-supplied user ID, or an unverified callback is insufficient.
4. Prepare by blocking that managed identity and revoking its application
   sessions while preserving all profiles, holdings, watchlists and billing rows.
5. Call only the documented managed SDK self-service deletion method for that
   same live provider session. Do not introduce a broad Neon admin key in Render.
6. Require explicit provider confirmation of completed deletion. An error,
   timeout, missing user, pending verification email or ambiguous response must
   never be treated as successful deletion of application data.
7. Persist recoverable phase evidence before any later application purge. Keep
   local financial data intact on provider uncertainty or final-transaction failure.
8. Only a separately authorized execution may perform the final owner-specific
   application deletion and existing media-cleanup enqueue. Any final database
   failure must roll back that transaction and retain a support/recovery receipt.

## Unit-test requirements

- Mismatched owner/issuer/provider and legacy source rows fail before mutation.
- Missing or stale step-up proof fails without calling the provider.
- A disabled flag fails without database writes or provider deletion.
- Provider rejection, outage and pending-email responses preserve financial rows.
- Final application removal cannot precede confirmed provider deletion.
- Final transaction failure preserves data and durable phase evidence.
- A successful mocked path affects only the explicitly confirmed managed UUID.
- Existing self-hosted deletion and all old owner/subscription protections pass.

## Risks requiring review before enabling

Provider and application database changes cannot share one atomic transaction.
A crash after remote deletion can leave preserved but inaccessible application
data requiring operator reconciliation. SMTP verification may make deletion
asynchronous. Neither condition may trigger an automatic historical restore,
email-based relinking, subscription transfer or unaudited purge. Live behavior
and recovery must be demonstrated with a separately approved disposable fixture
before the feature can be enabled for production.
