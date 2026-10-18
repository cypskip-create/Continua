# Browser-visible data and security boundaries

Supabase project URLs and publishable keys are public client identifiers.
Signed-in users also necessarily have access to their own session and request
identifiers through browser tools. Hiding those identifiers is not authorization.
See the [official key guidance](https://supabase.com/docs/guides/getting-started/api-keys)
and [row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Privileged Supabase/service-role keys, R2 credentials, database URLs, provider
secrets and the dedicated edge secret must stay on trusted servers. The root
production build now runs `infra/security/browser-secret-audit.mjs`; it fails on
known privileged-key patterns, private-key blocks and service-role JWTs. Local
verification may also compare artifacts against named existing server env files
without printing the values. Pattern scanning is an additional check, not a
proof that every possible secret representation or private-data flow is absent.

The deployed WebSocket loop now checks authentication on every broadcast and
requires explicit quote-symbol subscriptions. Frames, subscriptions, auth
concurrency and slow-client buffers are bounded. Hosted pages retain existing
HTTP quote polling instead of repeatedly sending a development placeholder to
a production socket. Authorized API socket clients keep their authenticated
protocol. No server API key is inserted into a browser to repair sockets.

On 2026-10-18, 171 built browser artifacts passed pattern scanning and comparison
against six existing server credential values without a match. The reported
Supabase 503 was not reproduced by public Auth health and an empty public-profile
view read: both returned 200. Seven inspected private application/payment tables
had RLS enabled; that inspection is not a full cross-account penetration test.
Raw financial originals remain private and are not exposed through media URLs.
