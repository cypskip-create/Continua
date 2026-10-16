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
