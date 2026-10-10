# Historical data rollout (2015 onward)

## Sources verified on 10 October 2026

- NSE listed-company announcements: https://www.nse.co.ke/listed-company-announcements/
  Year buttons cover 2015–2026. The site's published `nse_list.js` posts `list_dwnlds` with a live nonce/category, year and page. A 2015 request returned Barclays, NIC, KCB, Stanbic and Standard Chartered filings, with five pages. Never assume historical issuer names are current ticker identities: unresolved names remain in review.
- NSE press releases: https://www.nse.co.ke/press-releases/ and corporate actions: https://www.nse.co.ke/corporate-actions/. The same form is read dynamically where present. Corporate PDFs linked on the homepage are included.
- First-party issuer archives: existing Safaricom, KCB and Equity source registry. These supplement NSE archives, rather than proving every issuer/year has coverage.
- CBK Treasury bond/bill archives: https://www.centralbank.go.ke/bills-bonds/treasury-bonds/ and https://www.centralbank.go.ke/bills-bonds/treasury-bills/. Bond auction results extend well beyond 2015. Auction yield is distinct from NSE secondary-market yield.
- NSE market statistics: https://www.nse.co.ke/dataservices/market-statistics/. Includes indices, equity/bond/derivative statistics and USP (Unquoted Securities Platform, not “UPS”). Daily price-list downloads are not evidence of an unrestricted historical API.
- NSE historical-data service: https://www.nse.co.ke/dataservices/historical-data/. Obtain licensed historical EOD files/feed and commercial redistribution rights from dataservices@nse.co.ke. No endpoint guesses, anti-bot bypass or fabricated prices.

## Deployment order

1. Apply `20261010220000_historical_document_queue.sql` before deploying the scraper. It adds a private document queue, price provenance and research record types; it deletes no history.
2. Configure scraper `RAW_STORAGE_DRIVER=supabase`, `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=scraper-raw`. Keep the bucket private. Previously local artifacts are not automatically migrated: re-download them or copy retained files before switching drivers. Do not commit keys.
3. Deploy scraper/backend/app. Existing NSE cron automatically discovers the archive, queues documents and processes 25 per run, sequentially. Jobs resume after crashes, retry hourly, and recheck completed files weekly for revisions. Host throttling, robots and response-size ceilings apply to archive POSTs and PDF GETs.
4. Monitor `scraping.document_jobs` status/counts and `scraping.extractions` review state. A completed download is NOT equivalent to a verified financial period. OCR remains review-only when column structure cannot be recovered safely.
5. Run `npm run worker:financial-candidates` in backend. Use existing Admin Financials Review or `financials:review`, `financials:draft`, `financials:confirm`. Verify company, consolidated/company scope, each comparative year's end date, currency and multiplier before publishing. Historical columns feed canonical income/balance/cashflow tables, which already power Fundamentals/Engine financial and growth charts. Do not turn narrative mentions of revenue into audited figures automatically.

## Prices and market observations after permission

Price import: `npm run history:import -- licensed-observations.json` validates source-backed KES daily OHLC/volume from 2015 onward; append `--reviewed` to publish. Each record needs `symbol,date,currency,open,high,low,close,volume,sourceUrl,permissionReference,adjustment:"unadjusted"`. Dates are observed sessions only. Unknown active tickers, invalid ranges, duplicate sessions and conflicting existing bars abort the transaction. Price provenance is stored separately. Existing historical service aggregates true daily bars into weekly/monthly/yearly bars. ALL now requests 2015 onward. Closing-price-only files cannot be imported as candles; a dedicated close-series import/view remains follow-up work. No intraday history is synthesized from EOD bars. Corporate-action adjustment requires an additional verified adjustment workflow.

Market observations: existing `npm run research:import -- records.json [--reviewed]` now supports `derivative`, `usp`, `market_statistics`. Derivatives require price, ISIN and expiry; optional volume/openInterest/turnover. USP requires reported price. Statistics require actual/indicator/unit. NSE market-data records require a `payload.permissionReference` identifying operator-held written permission. This is an audit assertion, not automatic licence verification. Bond records retain existing auction tenor/yield checks.

Markets includes Derivatives and USP, dated observation tables, price history and source links. Reviewed market-statistics records populate the Overview indicator-history chart. NSE index records with NASI/NSE20/NSE25/NSE10, unit `points`, actual value and point change also update the existing index strip. No placeholder observations are inserted. Automatic index/report normalization and close-only series remain to be connected to the licensed delivery format. The migration pauses the existing index-summary source pending a permission reference, without deleting its stored history.

## Verified rollout progress

The additive migration has been applied and recorded in the production migration ledger. The queue, checkpoints, provenance tables and `scraper-raw` bucket are private. Render's scraper now has the server-only Supabase storage configuration; secrets are not committed.

All published listed-company and press-release archive pages were discovered for 2015–2026: 1,152 unique document jobs. At the initial checkpoint, 99 completed, one failed (retryable), and 1,052 awaited downloading. The 109 retained local PDFs (including earlier samples) were uploaded into the private bucket at their original hash paths. These counts are a checkpoint, not a claim of comprehensive ingestion. Run `npm run history:coverage` in backend for current download, archive-year, review and financial-period coverage.

Native PDF extraction now uses isolated `pdftotext -layout` processes (Poppler, installed by the scraper Dockerfile), avoiding the previous PDF worker cleanup failures. Scanned PDFs fall back to OCR and require review. A single process is bounded to 500 pages, 60 seconds and 20 MB of extracted text.

`backend/scripts/draftBondReport.ts` drafts observations from the documented CBK reopened-bond layout. It requires aligned issue/ISIN/maturity/yield columns and the signed report date. Auction yields are tagged `accepted_auction`, never passed off as secondary-market yields. Two observations in `cbk-reviewed-2026-09-30.json` were checked against a rendered official PDF and published. The tenor is the original issue tenor; coupon and price are not yield. Other CBK report layouts remain review-only.

Operator collection commands: `npm run history:backfill -- --discover-only` and `npm run history:backfill -- --drain-only --batches=4` in scraper. The CLI does not reveal private environment values. Discovery stores each page's jobs before checkpointing it, so a restart does not lose older years.

## Remaining work before claiming comprehensive coverage

Finish deploying services, drain the remaining documents, review the 330 pending financial candidates and historical issuer identity changes, verify financial columns against rendered PDFs and chart values, connect the licensed price/index/statistics delivery format, broaden CBK layout coverage, and monitor per-company/year coverage. Pending financial candidates are not published audited facts. Six-month/YTD periods must not be mislabelled as standalone quarters. No new historical equity figures are claimed published at this checkpoint. Restricted NSE market collection remains disabled pending written permission, even for private product testing.
