# KenyanStocks collection coverage

Python/Selenium remains the chosen runtime: reuse the native PDF/OCR, async
download, durable SQL queue and private R2 storage implementation. Selenium's
[explicit waits](https://www.selenium.dev/documentation/webdriver/waits/)
support dynamic publisher controls without adding a Node browser service.

KenyanStocks is first in scheduled document collection; other enabled sources
remain fallbacks and independent evidence, not overwritten authority. Official
NSE data remains authoritative for official indices. Do not treat mirror upload
dates as fiscal report dates or automatically publish unreviewed statements.

All discovered issuers plus configured/current NSE symbols enqueue Summary,
Financials (all five known and dynamically discovered categories), Statistics,
News, Corporate Actions, Historical Data, Holders and Files. Financial groups
expand recursively and settle after each action. All DOM table columns are
retained, including horizontally clipped years. Scrolling collects lazy-loaded
content; hitting its safety or expansion ceiling is retryable, not complete.
Discovery pages receive the same scrolling pass. Receipts retain discovered
stock count, queued stock count, planned view count and listing failures;
fallback catalogue work must not conceal failed publisher discovery. On the
16 October audit the public stock list exposed 56 issuer rows and 56 distinct
issuer links, without pagination controls. Each receives twelve initial views
(eight tabs, with five Financials categories), before dynamically found PDFs.

Files from every view enqueue private PDF downloads, with issuer attribution
preserved through extraction. News cards retain displayed headline, excerpt,
publisher, original link and displayed date. This does not confer permission to
download full articles from unrelated publishers; those remain separate sources.

The finite Actions runner gives KenyanStocks twelve serial jobs per document
run, alternating all view types and PDFs to prevent archive starvation. Jobs
retain leases, retry ceilings and seven-day rediscovery. Completed weekly
refreshes reset their attempt allowance and move behind older pending work,
rather than eventually exhausting a lifetime five-attempt limit. This is incremental
archive coverage, not a claim every stock was downloaded in a single run.

Three scheduled news runs reserve 16MiB each; the daily document run reserves
64MiB, fitting the unchanged 128MiB daily logical ceiling. The larger document
allowance accommodates download plus R2 upload of larger reports. Existing
600-second execution limit, domain/robots rules and TLS checks remain. Render
does not handle bulk collection or store these files. Limits are not invoice caps.

Live verification on 16 October queued 828 views from the combined universe and
stored/extracted two artifacts, but exposed ten browser timeouts. Publisher-only
network settling fixes the reproduced timeout: intentionally blocked analytics
must not hold the source-data quiet window open. A real isolated Files render
then passed locally. Safe exit codes identify navigation/settling/control phases
without logging URLs, page content or credentials. Run claims now use a short
transaction advisory lock plus durable 30-minute active-run records, rather than
session locks that are not reliable through transaction poolers. The daily quota
reservation remains atomic with the claim, and is never refunded by retries.

## Verified execution — 16 October 2026

[Actions run 38902163789](https://github.com/cypskip-create/Continua/actions/runs/38902163789)
on revision `93f5093` completed actual collection (not overlap/budget skipped):
56 publisher stocks, 69 queued stocks including catalogue fallbacks, 828 planned
views, one fetched/new/extracted artifact, zero failures and zero listing failures.
The one-document check downloaded 2,557,491 logical bytes and uploaded 652,250
bytes directly to private R2 under its 16MiB reservation. No Render transport.

A separate credential-free local check executed all twelve COOP view/category
jobs through the real isolated renderer: all succeeded without coverage limits.
Profit/Loss exposed 30 rows and five expanded groups; Cash Flow 27 rows/four
groups; Assets 18 rows; Liabilities and Equity eleven rows each; Historical Data
2,942 table rows; Holders eleven rows; Files 23 PDF links. Statistics, News and
Corporate Actions also rendered and settled; zero table rows there does not mean
their text/cards are absent. The adapter retains rendered HTML and displayed
text/cards as evidence rather than inventing numerical table data.

This verifies discovery and execution, not completion of all 828 queued views or
all linked PDF downloads. Remaining work is durable, incremental scheduled
backfill within the daily budget; no unlimited fetch or complete-archive claim.
