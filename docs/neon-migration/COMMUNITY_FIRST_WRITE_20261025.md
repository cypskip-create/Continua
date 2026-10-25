# TradersHub first-write and feed repair

## Confirmed reaction failure

Minimal inserts/upserts return HTTP 201 with an empty body. The browser adapter treated that valid response as malformed JSON. Thus the database write succeeded while the UI reported "Data service returned an unexpected response". Retrying could toggle a reaction that was already saved.

The browser now accepts only the exact minimal table-write contract: POST, HTTP 201, no requested representation, no content type, and a genuinely empty body. Nonempty HTML, challenges, empty reads and missing requested representations remain errors. Writes are never automatically replayed. After confirmed save, the reaction display updates immediately; background reconciliation does not block the successful response. A regression exercises the real Express router through the real browser adapter and asserts one insert, one HTTP request and no first-save error.

## Feed latency and intermittent failure

The old feed required five initial requests plus at least eight enrichment requests. Each authenticated request independently verified the live managed identity, acquired a SQL connection, set claims and ran the live SQL guard. A single failed safety dependency prevented feed display. Large comment/reaction tables could also exceed browser response limits before client aggregation.

`GET /api/v1/data/community_feed` now builds a bounded 50-post feed in one authenticated RLS transaction. It retains hidden posts, blocked/muted users, literal muted keywords, public author projections, likes/reposts/bookmarks, reactions, quoted posts and the latest two comment previews. Counts are computed in SQL; entire comment/reaction tables are not transferred. No privileged service role, shared private cache, or security-definer feed function is introduced. Existing per-table endpoints and other app features are unchanged. A 404-only client fallback permits safe frontend/backend deployment ordering; security or provider failures never trigger that fallback.

This reuses JavaScript in the existing compatibility API/browser adapter and PostgreSQL for set-based authorized reads. It adds no runtime or paid service and does not complete or switch the separate Go rewrite. References: [PostgREST minimal write responses](https://docs.postgrest.org/en/v14/references/api/preferences.html), [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

## Regression scope

Check real router/browser first-upsert compatibility, empty representations, HTML rejection, authentication/owner injection rejection, one feed identity verification, SQL guard order/rollback, and existing query compilation. Run frontend tests/typecheck, backend tests/build/typecheck and Cloudflare checks before verifying both deployments. Provider cold starts remain an infrastructure limit; reduced feed work must not be represented as eliminating them.

Local regression results: 598 backend tests passed, 18 intentionally skipped; 183 frontend tests passed; both frontend and backend typechecks passed. PostgreSQL validated the complete query plan. A read-only aggregate check under `authenticated` with the existing live SQL guard evaluated the current one-post feed (1,198 response bytes) in 296 ms including its database round trip. No social content or credentials were printed and no production row was modified by that audit.
