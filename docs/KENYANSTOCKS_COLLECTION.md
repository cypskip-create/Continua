# KenyanStocks collection

Operator confirmed automated downloads and display to paying Continua users
on 12 October 2026. This is recorded as an operator assertion, not an
independently verified licensing contract. Defaults remain unlicensed for a
new installation; never copy permission from this operator to another one.

## Coverage

Discovery follows rendered stock links on the homepage and its observed full
listing links. Configured tickers supplement discovery; publisher/backend
aliases DTK/DTB, SBIC/STANBIC and HFCK/HFCB are distinct from new issuers.

Each stock initially receives 12 durable view jobs: Summary; five Financials
categories; Statistics; News; Corporate Actions; Historical Data; Holders;
Files. Newly observed tabs/categories are queued too. There is no 22-tab
ceiling. Files queues actual publisher PDF links separately. Missing sections
are not populated with guesses. Robots checks, public-network URL checks and
host throttling apply. No paywall, CAPTCHA or anti-bot bypass is used.

Financial group buttons are expanded and horizontally off-screen table
columns are retained. History requests a start date of 2015-01-01 using the
publisher's visible date control. That is a requested window, not a claim
that the publisher has every session or every year. Bounded lazy scrolling
records a coverage flag when the limit is reached. HTTP errors remain
retryable jobs. Collection runs in the separate scraper, not the live API.

## Evidence and publication

Raw HTML/PDF bytes are content-hashed and privately archived. Structured
tables retain original labels, year columns, raw cells, signs, units and
precision flags. Narrative sections remain in the HTML/text evidence even
when they have no tables. Table data is publisher evidence requiring mapping
and validation, not automatically approved issuer financial statements.

Publisher summary Revenue and banking Net Interest Income are not equivalent.
Groups, subtotals and subsidiary documents must not be combined blindly.
Files upload timestamps are not issuer publication or financial period dates.
Downloaded PDFs enter the existing Engine issuer/period/unit/accounting
validation pipeline; unsupported layouts and conflicting results stay in
review. Collection does not bypass that publication gate.

OHLCV extraction checks dates and price bounds, rejects future observations
and preserves abbreviated-volume precision. Adjustment basis is explicitly
unknown until established. Rounded 126.28K is not asserted to be exactly
126,280 traded shares. These observations do not silently replace canonical
price candles or corrected issuer statements.

## Operations

Run from `scraper`, loading server credentials privately from the ignored
backend env file: `npx tsx scripts/backfillKenyanStocks.ts --discover-only`.
For bounded catch-up: `npx tsx scripts/backfillKenyanStocks.ts --drain-only
--batches=2`. The deployed durable-queue scheduler continues processing while
the scraper is running. Free hosting may sleep; no paid always-on service is
enabled by this change. An interrupted run resumes through queue leases.

Inspect source/job/issuer coverage with backend
`scripts/diagnosePublisherCollection.ts`; it prints public identity and
aggregate coverage, not credentials. Adapter mapping versions trigger
reprocessing of unchanged artifacts when upgraded.

The app's stock list, Markets, screener and detail metadata now consume the
backend instrument directory rather than excluding listings missing from a
fixed frontend array. Reference aliases remain fallback names, not additional
securities. Exchange status and source availability remain backend facts;
appearance in a third-party directory alone is not proof of active trading.
