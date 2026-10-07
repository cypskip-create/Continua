# Engine access and financial-news fixes

- Hosted REST calls use Vercel's `/data-api` rewrite to Continua Data API. Supabase user-token authorization remains enforced upstream; this is not an entitlement bypass. WebSockets keep the actual backend origin.
- Production ignores an accidentally shipped loopback API URL. Development retains explicit local backends.
- CORS permits explicit Continua deployment aliases and local development origins, not arbitrary Vercel sites.
- Workspace Portfolio does not request or render unrelated company analysis. Optional company enrichment shares an eight-second budget with at most four concurrent requests; incomplete coverage stays explicit rather than inventing findings.
- Financial coverage is checked on backend reads and frontend cached feeds. Publisher labels and company tags alone are insufficient. General crime/sports incidents are excluded; macroeconomics, property, fuel and company financial developments remain eligible.
- An article without verified issuer links has no empty affected-company notice.

Verification: endpoint configuration and origin-policy tests, shared financial-topic regressions, bounded-enrichment tests, app/backend type checks and builds, and browser checks for Portfolio reload and theme controls at 320/390 px with XL text. Browser checks use fixtures; authenticated production portfolio data is not accessed by these tests.
