# Engine and news continuation — 7 October 2026

## Verified implementation

- `430fa9b` unified stock Fundamentals and added the paid-only calculated Engine. Free Fundamentals uses an atomic five-distinct-stock calendar-month allowance; Engine endpoints validate the Supabase session and database subscription, not a client plan flag.
- Follow-up fixes Engine's refresh button to refresh supporting active charts and feeds as well as its briefing bundle.
- Isolated mobile tests exercise paid briefings, valuation, ownership, sourced estimates, editable growth scenarios and refresh. A separate free-user browser context verifies Engine output is not fetched. These complement backend entitlement tests, not replace production authentication testing.
- Publisher configuration uses recurring RSS feeds for TechTrends Kenya, Soko Directory and Business Daily Africa, with publisher root websites for attribution/terms. No provided article slug or `utm_source` is seeded as the crawl source. Regression tests enforce those three feed configurations.

## Production checks

- Supabase introspection confirms the existing gallery column, post-images bucket, poll vote table/RPC, expanded post reactions and atomic alert delivery function. No posts, votes, notifications or portfolio entries were created to test these.
- The supplied `https://continua-scraper.onrender.com` responds successfully to health and database checks. TechTrends discovery found 41 feed entries; Soko found 10. Business Daily discovery returned zero under crawler policy; no robots/paywall bypass was attempted.
- Triggered TechTrends and Soko ingestion through existing adapter endpoints. TechTrends completed 41 fetches, seven new artifacts/extractions, zero failures. Soko completed ten fetches without failures and no further new artifacts in that manual pass. Supabase confirms both sources have October 7 extraction timestamps.
- Backend bridging subsequently delivered October 7 headlines into `market.news_items`, including the Safaricom/M-Pesa money-market-fund headline published at 05:01:58 UTC. This verifies the live discovery → extraction → app news database path for these publishers.

## Boundaries still requiring verification or external support

- Fresh extraction is not itself proof of every article appearing in the frontend: backend news bridging, financial relevance filtering and cache refresh also apply.
- The repository's Render blueprint uses free web services. In-process cron scheduling cannot guarantee unattended freshness when a host suspends the process. Always-running hosting or a supported external job runner requires an explicit deployment choice; no paid upgrade was purchased.
- Analyst forecasts, geographic/business-segment figures, insider transactions, options and depth data are not fabricated when verified coverage is absent. This is not a complete Moomoo clone or a claim that all historical NSE datasets are complete.
- Six backend database integration checks require a separate test database. Browser mutations remain fixture-only; physical iPhone keyboard and production financial calculations still need device/staging validation.
- Other pre-existing local image deletions are intentionally excluded from this work's commits.
