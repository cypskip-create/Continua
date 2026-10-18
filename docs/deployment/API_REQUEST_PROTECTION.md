# API request protection

The deployed compatibility API retains API-key, verified subscriber, owner,
entitlement and signed-payment-webhook checks. Admission limits do not replace
those checks. Native Go cutover remains subject to the complete parity ledger.

Before authentication, a connection gets 120 requests/minute. Health probes are
excluded. Admin requests additionally get 20/minute before secret verification;
rotating guessed admin keys cannot reset this bucket. Signed Paystack webhooks
retain their separate 120/minute bucket and raw-body signature verification.

After API-key and Engine identity verification, the existing key-configured API
limit applies. Additional one-minute workload buckets allow five import/export
requests, 20 billing requests, 20 Engine writes, 30 Engine reads and 30 other
mutations. Engine users have independent verified-user buckets. Other callers
use API-key/client-IP buckets. Query changes do not create new workload buckets.
Market reads retain the existing API limit without a new workload bucket.

## Storage and identity

`CACHE_DRIVER=memory` uses bounded single-process stores, each capped at 10,000
active identities. Full stores return retryable 503 responses instead of evicting
active counters. Memory limits reset on a process restart and are not distributed.
Render was verified to use memory on its single free instance on 2026-10-18.

Configured Redis/Upstash reuses the existing cache provider with atomic expiring
Lua counters, separate hashed namespaces, 1.5-second command deadlines and a
32-command concurrency bound. Counter failure returns 503 with `Retry-After: 2`;
it never falls back to an empty memory counter. Ordinary cache-read fallback is
independent. No paid or always-on service is provisioned by this change.

The optional dedicated secret must match between Worker `EDGE_ORIGIN_SECRET`
and backend `CONTINUA_EDGE_ORIGIN_SECRET`. The Worker replaces caller-supplied
identity headers. Only a constant-time secret match and valid literal IP allow
the backend to accept `X-Continua-Client-IP`; otherwise the configured trusted
Render proxy hops determine the address. IPv6 normalization prevents address
rotation within a /56 from creating independent IP buckets. This assertion grants
no user identity, API key, entitlement or admin access. Keep it server-side and
out of logs, source control and browser bundles.

## Verification

On 2026-10-18, all 438 backend tests passed (17 existing skips), the production
build and declaration checks passed. The isolated real Redis fixture passed ten
checks with 30 concurrent increments across two independent connections,
restart continuity, expiry and fail-closed error behavior. The local fixture
container was removed. CI repeats the fixture against a pinned, bounded Redis
service without production credentials. Tests also exercise actual HTTP
admission, forged proxy headers, independent users, admin guesses and memory
capacity/provider backpressure. These checks are not a penetration test or proof
of protection for Supabase's separately hosted `/auth/v1/token` endpoint.

References: [express-rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration),
[Redis EVAL](https://redis.io/docs/latest/commands/eval/),
[Node constant-time comparison](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b).
