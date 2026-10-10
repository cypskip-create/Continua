# Research and subscription update

Premium Plus costs KES 1,000 monthly. Annual billing charges KES 9,960 once a year: KES 830 per month after a 17% discount. Premium remains KES 800 monthly or KES 7,980 yearly.

Premium retains expanded Fundamentals and basic Engine Briefing/Forecast. Full Engine bundles, workspace persistence, peers, monitoring and Ask Engine require a server-verified Premium Plus plan. Free Fundamentals allowances remain unchanged.

## Deployment prerequisites

- Deploy frontend, backend and scraper together.
- Apply `20261010140000_filing_history_reviews.sql` before using the new historical-column review action.
- Apply `20261010143000_nse_only_active_catalog.sql` to remove unsupported exchanges and noncanonical Safaricom identifiers from active discovery. It preserves referenced history, but removes their live quote rows. Archived instruments are not tradable catalog entries.
- Remove obsolete provider environment variables from hosting dashboards. Live NSE data now uses the configured NSE transport; production does not silently fall back to synthetic fixtures.
- Configure `TRUST_PROXY_HOPS` to the actual hosting proxy chain (default one in production). Public API rate limits are per browser API key and client IP, not a single shared website bucket.
- Ensure the frontend's public market-data API key is active. The local configured key returned 401 during read-only checks; the production deployment's key was not verified.

## Payment safety

The existing checkout granted subscriptions without collecting payment. It now refuses upgrades unless explicit test checkout is enabled through `ALLOW_MOCK_SUBSCRIPTION_CHECKOUT=true`. Test mode clearly reports that no payment was taken. A real verified payment integration is still required before accepting live purchases; prices alone do not constitute billing integration.

## Historical filings

Official NSE announcement PDF fetching remains enabled. Real archive/year/pagination links are followed with robots checks, rate limits, duplicate detection and a 40-page cap. JavaScript-only year buttons without URLs still need verified `archiveUrls` in the source configuration; URLs are never guessed.

The review page drafts every comparative column. A reviewer must confirm dates, source pages, group/company scope and base-unit conversion before publication. Imports are transactional; duplicates, inconsistent balance sheets and older replacements of newer filings are rejected. Explicit restatements retain previous values and source-page provenance. Published periods feed the existing financial-history endpoints, including periods that only contain balance-sheet or cash-flow data. This does not automatically validate or backfill all historical PDFs.

## Cleanup

Removed the unused provider implementation, unused snapshot JSON exports, duplicate environment example and duplicate index hook. Git retains recoverable copies. Applied historical migrations are intentionally preserved rather than deleted or renamed.

## Reliability

Markets now avoids unrelated research requests, accommodates cold starts and derives a clearly dated partial breadth/sector snapshot from available quotes when its optional research endpoint fails. Existing quotes survive research failures. External outages remain possible; do not promise that all network or source failures can be eliminated.
