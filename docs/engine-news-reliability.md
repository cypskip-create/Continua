# Engine access and financial-news fixes

- Hosted REST calls go directly to the CORS-authorized Continua Data API. The Vercel rewrite was removed after live probes returned HTTP 429 HTML with `cf-mitigated: challenge`, rather than an application quota response. No challenge-solving or security bypass is implemented.
- Engine requests are authenticated before metering, with separate rate-limit buckets per server-verified account and API key. Public-data traffic retains the existing per-key budget. Subscription checks remain server-side and identity is reused only within one request.
- GET requests can retry once after an explicit JSON 429 `Retry-After` of at most ten seconds. Mutations and hosting security challenges are never automatically replayed. CORS exposes retry metadata.
- Production ignores an accidentally shipped loopback API URL. Development retains explicit local backends.
- CORS permits explicit Continua deployment aliases and local development origins, not arbitrary Vercel sites.
- Workspace Portfolio does not request or render unrelated company analysis. Optional company enrichment shares an eight-second budget with at most four concurrent requests; incomplete coverage stays explicit rather than inventing findings.
- Financial coverage is checked on backend reads and frontend cached feeds. Publisher labels and company tags alone are insufficient. General crime/sports incidents are excluded; macroeconomics, property, fuel and company financial developments remain eligible.
- An article without verified issuer links has no empty affected-company notice.

Verification: endpoint configuration and origin-policy tests, shared financial-topic regressions, bounded-enrichment tests, app/backend type checks and builds, and browser checks for Portfolio reload and theme controls at 320/390 px with XL text. HTTP limiter tests exhaust the shared public quota and independently exercise two authenticated Engine accounts, rejecting forged sessions and identity headers. Browser fixtures throttle both portfolio endpoints once to verify bounded recovery. Browser checks use fixtures; authenticated production portfolio data is not accessed by these tests.
