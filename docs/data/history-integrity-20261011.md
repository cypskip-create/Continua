# History integrity and expanded collection — 11 October 2026

## KCB discrepancy

The stored daily series ended on 12 September 2026 at KES 49.69. The quote
was KES 89.75 on 9 October. The available dated annual EPS was 6.43 from
FY2017: 49.69 / 6.43 = 7.73, whereas 89.75 / 6.43 = 13.96. These are not
same-date observations. The old view combined cached headline ratios with
client-side historical calculations and did not expose that difference.

`GET /valuation/:symbol/history?ratio=pe&years=5` now calculates headline
and historical ratios in the Engine from one as-of methodology. Only
financials published by each observation date are eligible. The UI shows
quote date, fiscal year, denominator, history endpoint date and old-financial
coverage warnings. No TTM or forward basis is asserted for annual figures.

## Provenance

The 49,709 existing candles had no source URL. Migration
20261011211500 adds a nullable source_url without deleting or rewriting them.
Production price-history reads exclude untraceable rows. Live MyStocks/AFX
collectors attach their actual source; mocks do not. A mock/unknown incoming
bar cannot overwrite an already traceable observation. Financial-history
reads require the canonical filing-review ledger in production. This may
reduce visible history until genuine source-backed observations arrive;
never backfill source URLs onto unknown rows merely to restore a chart.

## Collection added

- KenyanStocks: discover NSE company pages and their rendered Files tabs;
  queue the observed assets.kenyanstocks.com PDFs, hash and archive them
  privately. Subsidiary documents must not become listed-group financials.
- AFX: collect explicitly dated closes as review candidates and narrowly
  scoped profile facts. Never manufacture OHLC from closes or substitute
  website snapshot P/E for reported annual earnings. Canonical profile gaps
  may use exact-identity, attributed address/website facts; first-party
  fields are not overwritten.
- Additional first-party financial archives: Centum, Jubilee, CIC, BAT
  Kenya and BOC Kenya. Existing NSE and issuer archives remain enabled as
  configured by the operator. Robots and rate limits remain enforced.

These third-party collectors do not imply blanket third-party redistribution
rights from NSE's approval. Full report text/files are not republished by
these changes. Upload timestamps are not financial publication dates.

## Automatic validation, not manual publication

Validator v6 rechecks eligible retained extractions. Exact masthead matching
normalizes legal suffixes and punctuation but keeps Group, country and
subsidiary identity. Registered mirrored PDFs can use the same native-report
validation gates as first-party reports, with their mirror provenance intact.
Issuer identity, explicit periods, units, approval date, balance equations
and canonical-conflict checks remain mandatory. Collection and validation
are ongoing worker jobs, not a one-off agent import.

The audit found a substantial pending queue and unsupported layouts.
OCR, ambiguous reporting dates, unknown layouts and conflicts remain in
review. This change does **not** assert that every issuer/year is populated
or that all scanned reports are automatically publishable. Missing years
remain missing until supported, validated source observations exist.

## Additional official archive references

- https://centum.co.ke/annual-reports/ — archive lists reports back to 2002/03.
- https://jubileeinsurance.com/group/investor-relations/annual-reports/ — reports back to 2011.
- https://www.cicinsurancegroup.com/investor-relations/
- https://www.batkenya.com/investors-and-reporting
- https://www.boc.co.ke/our-business/investor-relations

Issuer reports provide financial history, not a replacement for exchange
daily trading data. Comprehensive historical prices still require the NSE
licensed delivery format or another permitted, traceable market-data source.
