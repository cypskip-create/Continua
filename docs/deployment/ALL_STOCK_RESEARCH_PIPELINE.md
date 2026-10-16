# All-stock research delivery

The collector's normal discovery reads the registered NSE universe and publisher
listing, then durably queues every issuer view. An issuer argument is diagnostic
only, not required for scheduled operation. No COOP-specific values or chart
definitions are used.

Daily schedule: three primary document batches at 06:43, 12:43 and 20:43 UTC
(09:43, 15:43, 23:43 Africa/Nairobi), plus three 16 MiB news batches. Each document
batch reserves 48 MiB and attempts up to 48 primary-source jobs serially, within
the existing ten-minute collection deadline. Five of every thirteen claim lanes
are Financials; the other lanes cover Summary, Statistics, News, Corporate
Actions, Historical Data, Holders, Files and PDFs. The configured daily allowance
remains 192 MiB. This does not promise a full-universe pass in one day.

Completed runs settle measured unused reservations atomically under the shared
scheduler lock, retaining their recorded transfer counters plus a 1 MiB buffer.
An idempotent reservationSettlement receipt records the original, retained and
returned byte counts. Failed, interrupted and budget-paused runs are not refunded.
The daily counter is never reset and the daily ceiling is not increased. This is
logical-transfer accounting, not a hard dollar invoice cap.

Automatic post-collection Engine processing handles up to 100 observations. A
presentation-version upgrade reprocesses older eligible records from retained
extractions without downloading their originals again. Exact source labels map
to annual research fields; ownership uses the actual percentage column. Unknown
revenue, dates, accounting scope, holder classifications and analyst estimates
are not invented. Conflicting projected fields are withheld.

The UI shares one destination-filtered research query per stock. Financial
charts, annual Focus observations, scenarios, actual earnings-history charts and
ownership disclosures consume the appropriate prepared fields. Verified filing
records remain authoritative; publisher supplements are explicitly labelled and
are not promoted into canonical valuations or consensus estimates. The existing
blue fundamentals chart color is #4f7cf5.

Maintenance processing receipts include stockCoverage for every registered NSE
security, so an empty/uncollected stock cannot be mistaken for a completed one.
Deployment alone is not proof of all-stock data availability; live run receipts
and app checks establish actual completed coverage.
