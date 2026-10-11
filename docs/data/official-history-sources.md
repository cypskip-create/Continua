# Official company-history sources

Verified on 10–11 October 2026. Public accessibility is not blanket permission for redistribution, scraping or commercial market-data use. Respect publisher terms and robots; retain source URL, exact reporting period, scope and units.

| Source | Archive | Useful information | Collection status |
|---|---|---|---|
| Safaricom | https://www.safaricom.co.ke/investor-relations-landing/reports/financial-report/financial-results | Annual results booklets, presentations, press releases, annual reports | Existing issuer source |
| KCB Group | https://kcbgroup.com/financial-statements and https://www.kcbgroup.com/integrated-reports | Group statements, audited annual accounts, interim disclosures, notes; visible integrated reports 2020–2025 | Existing issuer source; integrated archive documented |
| Equity Group | https://equitygroupholdings.com/investor-relation/?cat=annual-report and https://equitygroupholdings.com/investor-relation/?cat=financial-results | Paginated annual reports, financial statements and investor booklets | Existing issuer source; additional annual-report archive documented |
| Absa Bank Kenya | https://www.absabank.co.ke/investor-relations/ | Annual and interim results; historical Barclays reports, including 2015 and earlier | Added first-party filings source |
| EABL | https://www.eabl.com/investors/annual-reports | Annual-report archive lists 2014–2026 | Added first-party filings source |
| Co-operative Bank | https://www.co-opbank.co.ke/investor-relations/financial-statements/ and https://www.co-opbank.co.ke/investor_categories/co-op-bank-group-agm/ | Paginated financial statements and integrated annual reports | Added first-party filings source |
| KenGen | https://www.kengen.co.ke/investor-relations/ | Financial statements and integrated reports; official PDFs located for 2015, 2020 and 2025 | Added first-party filings source |
| Capital Markets Authority | https://annualreport.cma.or.ke/ | Regulator's issuer-report resource portal; useful to cross-check retained annual reports | Reference source; not an assertion that every issuer/year is accessible or licensed |
| Central Bank of Kenya | https://www.centralbank.go.ke/bills-bonds/treasury-bonds/ and https://www.centralbank.go.ke/bills-bonds/treasury-bills/ | Auction results, coupons, maturity dates, prospectuses and schedules | Existing public-document sources; reviewed bond observations published |
| NSE issuer announcements | https://www.nse.co.ke/listed-company-announcements/ | Historical company statements, dividends, rights issues, announcements, issuer events | 2015–2026 archive pages discovered; document downloads/review ongoing |
| NSE Data Services | https://www.nse.co.ke/dataservices/historical-data/ | Licensed daily price history; request format, coverage, corporate-action basis and usage rights | Operator confirmed approval on 11 October 2026; original reference and historical delivery format still required |

## Using the data already stored

The reviewed Barclays/Absa 2015 scan has been published through the protected historical-column review workflow. Absa's official investor-relations page explicitly confirms that documents before 10 February 2020 used the Barclays Bank of Kenya name. This is a documented rename, not an assumed merger mapping.

- Group income for FY2015 and its FY2014 comparative: reported total operating income, after-tax profit and EPS.
- Group FY2015 balance: assets, liabilities and shareholders' funds; the three totals balance exactly.
- Monetary report units are Shs '000, converted to base KES; EPS remains KES per share. The source approval date is 4 March 2016.
- Comparative balance figures and cash flow have not been guessed or published. Review manifests, source hash and page references are preserved in `barclays-2015-reviewed.json` and the database review ledger.
- Existing Fundamentals financial/EPS/return-on-capital charts and Engine Earnings & Reports consume the canonical financial history. Growth calculations need adjacent matching periods; a gap from 2015 to 2026 is not a one-year growth rate.
- Reviewed CBK bond records now support an instrument-specific dated yield/price view. Auction and secondary-market yield histories remain separate. A single observation appears as a point with a coverage warning, not a trend or prediction. Price-per-100 charts require that verified unit.

No price candles, analyst estimates or missing financial periods are synthesized from report text. A new permission enables the relevant authorised collection workflow; it does not itself verify downloaded figures or create missing historical data.

## NSE approval activation, 11 October 2026

The operator reports receiving written NSE approval and explicitly confirmed that it covers historical prices, indices, bonds, derivatives, automated collection and display to paying app users. Both existing NSE market collectors have been enabled in the production source registry, with this operator attestation recorded in their configuration. The original approval document/reference has not been inspected or supplied; no publisher approval number is invented. Defaults remain disabled for unrelated/fresh installations.

`backend/scripts/enableLicensedNse.ts "approval reference" --scope-confirmed` is an explicit operator action, never a startup migration. Update the audit with the actual reference when available. Publisher robots, throttling and source validation remain enforced. An approved collection attempt does not guarantee that a website exposes complete historical OHLC files; request the actual licensed file/feed specification before wiring a parser for that delivery.
