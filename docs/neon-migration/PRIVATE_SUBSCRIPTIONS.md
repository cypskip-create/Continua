# Private subscriptions candidate

The app uses two private Supabase channel contracts: notification invalidation for
the signed-in owner and room-message inserts. The candidate reuses the existing
Render HTTP/WebSocket listener and adds an owned same-origin Cloudflare upgrade
at `/api/v1/events`. No Neon Realtime service, replication slot or extra service
is enabled. Production selection remains unchanged.

## Protocol and authority

The URL has no query parameters. Browser cookies and caller API keys are not
forwarded. The first frame is `authenticate_user` with an in-memory short-lived
JWT. The existing access verifier checks signature, issuer/audience, live database
session and enabled MFA. A user JWT grants private subscriptions only; it never
replaces market-stream API-key authentication. Origin must match the configured
application origins. Changing user ID on a socket closes it.

`subscribe_private` accepts only `notifications` with a user UUID or
`room_messages` with a room UUID. Notifications require the verified owner UUID.
Every snapshot rechecks the live token and executes the existing allowlisted SQL
compiler under the authenticated role, row policies and SQL session guard.
Room authorization remains exactly the database policy; knowing a room ID does
not bypass it. No arbitrary table, SQL, filter or browser-supplied claim is used.

## Reconciliation semantics

While subscribed, changed snapshots reconcile at five-second intervals. These
are the latest 100 rows ordered by creation time and ID, not a durable CDC log or
every intermediate update. Notifications invalidate their existing query.
Owned room UI replaces its displayed snapshot in chronological order, which
avoids duplicate replay and catches deletions on the next reconciliation.
After a disconnection it restores the latest authorized snapshot rather than
claiming to replay an unlimited event history. Normal latency and resource cost
must be measured on the deployed path before approval.

One browser transport shares duplicate contracts, restores subscriptions with
bounded exponential reconnection delays, renews authentication every 30 seconds,
and expires a missing authentication acknowledgement after eight seconds. It
keeps no token or snapshot in browser storage. Sign-out/account changes clear
the socket and snapshots; late restores and late frames cannot revive them.
Unsubscribing the last consumer stops reconnect and heartbeat work.

## Resource boundaries and outstanding checks

The existing socket cap is 128 total clients and 120 inbound frames/minute per
client, with 16-KiB inbound frames and no per-message compression. Private
connections additionally cap at 32 total, four per verified owner, and two
contracts each. Snapshot JSON is bounded to 256 KiB and 100 rows; slow consumers
close above the existing 512-KiB outbound buffer. SQL connections are released
after each transaction and polling stops after disconnect. These are candidate
admission bounds, not measured claims that the free service sustains all maxima.

Tests cover JWT/API-key separation, forbidden token URLs/origins, owner mismatch,
revocation, disconnect cleanup, backpressure, bounded subscriptions, reconnect,
account-switch cancellation and late restore. Real staging notification reads
are exercised by the price-alert fixture. Deployed Cloudflare upgrade behavior,
room membership/RLS cases, UI smoke tests and Render/Neon resource measurements
remain release gates. The optional runtime argument on the WebSocket factory is
dependency injection for isolated local fixtures; production calls retain the
normal configured identity runtime.
