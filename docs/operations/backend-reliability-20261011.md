# Backend restart investigation — 11 October 2026

## Verified cause

Render Events recorded exit-status-1 failures around 16:03, 16:06 and 16:08 EAT. The matching fatal stacks end in `apiKeyRepository.touchLastUsed`, following Postgres connection timeouts. REST authentication launched this write without a rejection handler. A best-effort audit write could therefore terminate Node and interrupt all financial/history requests.

Authentication also computed a synchronous scrypt hash on every request, even for a cached key, and issued a last-used UPDATE for every request. Concurrent cache misses were not coalesced. The portfolio market benchmark launched fifteen separate research requests in addition to its screener read. These amplified CPU/pool congestion; this is not evidence that the database lost financial records.

The screenshot's separate `Health check failed` entries returned HTTP 200 with database and cache passing. They were caused by applying a fifteen-minute quote-age threshold on Sunday, when the price worker correctly does not poll the closed NSE.

## Changes

- Catch best-effort audit failures, without exposing credentials or weakening authentication. Coalesce audit writes to once a minute per key.
- Derive the identical stored scrypt hash asynchronously on cache misses; share REST/WebSocket key lookups. Existing keys and the thirty-second revocation window are unchanged.
- Coalesce concurrent cache loaders in both drivers. Errors clear in-flight state and remain errors, never empty results.
- Cache financial reads for sixty seconds, keyed by exchange, symbol, period type and history limit. Fresh cached frontend statements no longer re-fetch on every mount. Quarterly latest reads use the quarterly period/key.
- Use the existing bulk screener ratios for market benchmark averages instead of fifteen company requests.
- Share health probes for five seconds. Closed-session age is explicitly disclosed without pretending quotes were updated; trading-session stale quotes still degrade data health. Database outages still fail health checks.

## Verification and limits

Read-only production repository checks returned SCOM FY2015, FY2016, FY2025 and FY2026; ABSA returned FY2014 and FY2015. These are the currently stored, published periods, not complete issuer archives. Missing periods/fields must not be fabricated to disguise unavailable coverage.

Regression tests cover rejected audit writes, concurrent loader failures/recovery, identical asynchronous key hashes, closed/open-session health, and database outages. Backend and frontend builds/type checks are required before release.

Render still uses a free instance. Its dashboard explicitly warns of inactivity spin-down and request delays of fifty seconds or more. These code changes fix the observed process-crash mechanism and reduce load; eliminating provider-controlled cold starts requires an always-on hosting plan, not an application keepalive workaround.
