# Engine history and reliability — 11 October 2026

## Delivered scope

- Premium Portfolio Analysis no longer calls the Premium Plus-only portfolio workbench. Existing Premium scorecards and overview remain available. Plus retains the full workbench.
- Financial reads tolerate backend startup latency and retain saved data on failed background refresh. Main Fundamentals distinguishes an unavailable request from an empty archive.
- Trailing growth uses the same FinancialTrend bars, colors, thickness and per-period value rows as Financials. YoY requires an actual matching prior year/quarter.
- Valuation distribution uses chronological daily closing points and a line; the middle-50% reference band is an annotation, not the data series. No invented days or smoothing.
- Latest/history repositories exclude future period ends and future availability dates. Ingestion rejects invalid dates and unreconciled balance sheets before publication.
- Source-specific native PDF validators retain comparative columns. Group and company-only columns are never combined. Monetary units, dates, identity, source hashes and accounting reconciliations are checked. Unknown layouts/OCR still require review.
- A report publishes transactionally. Restatements clear old optional fields instead of leaving fabricated values attached to otherwise corrected statements.
- Missing EPS/CFO are permitted as null, not fabricated zero. Partial source-backed income/cash-flow history remains usable.
- Financial history returns reviewed source URLs; the app and Engine report coverage and gaps. Publication refreshes shared ratios, score and Engine caches.
- Earnings actuals and reporting dates use the same reviewed statements rather than a stale calendar snapshot. Missing reviewed EPS remains unknown; future reported events are not shown as completed results.
- Stock Overview no longer derives EPS, P/E, 52-week bounds or beta from static demonstration assumptions. EPS/P/E use the filed result/current quote, unknown range/beta stay unavailable, and scores come from Engine only. The unconfigured stock AI thesis call is removed.

## Verified production publication

Safaricom report extraction 136, official NSE audited FY2026 results: FY2025 and FY2026 income, balance and cash-flow statements. The invalid future-dated legacy FY2026 bundle is preserved in the private invalid_filing_archive before its atomic replacement.

Safaricom extraction 5095, official NSE FY2016 audited-results news release: FY2015/FY2016 revenue, net income, EBITDA, free cash flow and capital additions. EPS and CFO are not supplied by that table and remain null. Original release date is unknown: the first archive observation is conservative information availability, not an invented historical release date. PDF pages 6 and 8 were visually reviewed.

No claim is made that every company or every year is populated. Native, scanned and multi-column templates require separate mapping/reconciliation. Existing archival downloads alone are not publication. The five-minute financial candidates worker continues bounded validation batches, with versioned outcomes and retry after validator changes.

## Research and design decisions

These are independently implemented workflow principles, not integrations or replicas:

| Official source | Relevant principle | Continua decision |
|---|---|---|
| [BlackRock Aladdin Risk](https://www.blackrock.com/aladdin/platforms/products/aladdin-risk) | Consolidated risk and scenario workflows | Use shared source-backed financial/price inputs across company and portfolio research. Do not claim its proprietary factor models. |
| [Aladdin scenario framework](https://www.blackrock.com/aladdin/platforms/solutions/aladdin-wealth/making-of-a-market-driven-scenario) | Explicit hypothetical assumptions | Existing scenario tools remain illustrations, not promised outcomes; missing history cannot be silently fabricated. |
| [Bloomberg PORT](https://professional.bloomberg.com/products/bloomberg-terminal/portfolio-analytics/) | Validated portfolio data and integrated analytics | Make data quality and coverage visible before interpreting risk/performance. |
| [LSEG Workspace equities](https://www.lseg.com/en/data-analytics/products/workspace/equities) | Research and analytics alongside reliable data | Keep issuer, fiscal period, disclosure availability and analytical outputs linked. |
| [Fidelity fundamentals](https://www.fidelity.com/learning-center/trading-investing/fundamental-analysis/analyzing-stock-fundamentals) | Read related financial statements together | Publish income/balance/cash-flow comparatives into the same canonical periods. |
| [Moomoo financials API](https://openapi.moomoo.com/moomoo-api-doc/en/quote/get-financials-statements.html) | Related statement categories and period selection | Reuse a shared financial chart and presentation model across views. This does not consume Moomoo data. |
| [Robinhood earnings](https://robinhood.com/us/en/support/articles/using-earnings/) | Reported results distinct from expectations | Maintain actual versus estimate distinctions and source availability dates. |
| [Google Finance documentation](https://support.google.com/docs/answer/3093281?hl=en) | Historical-data availability and restrictions | Not treated as an unrestricted commercial NSE price-history API. |

## Remaining expansion

1. Add reconciled issuer templates for the remaining archive formats; audited annual reports, half-year disclosures and bank statements need distinct mappings. Preserve source/page/column lineage.
2. Add verified historic share counts, dividends and corporate-action adjustment basis before long-horizon total-return and P/B/P/S backtests.
3. The manual bond cash-flow/accrual/duration/convexity and futures exposure labs are implemented below. Automatic market-calibrated outputs still require reviewed curve inputs, contract specifications and settlement history.
4. Portfolio market/sector stress and covariance attribution are implemented below. Verified factor exposure/calibration remains data-dependent; sparse NSE prices must not imply institutional statistical confidence.
5. Continue conservative financial-news filtering and issuer evidence. User preferences affect presentation, not the underlying reported figures or entitlement security.

The Engine owns validated facts and calculations. The app renders shared chart series responsively; server-rendering chart images would remove interaction and is not necessary for central ownership of the data/analysis.

## Institutional-workflow expansion — 11 October

Implemented independently, not a clone or integration with institutional vendors:

- Premium: financial evidence checks, adjacent-year trend matrix, source/availability ledger and snapshot export in Earnings & Reports and Evidence. Unknown inputs are not scored as favorable. Generic liquidity/debt checks expressly do not replace bank regulatory-capital analysis.
- Premium Plus: a Risk lab with server-owned portfolio market/sector shocks; per-holding contributions reconcile to whole-portfolio P/L. Undated/future-dated quotes are excluded, stale and partial coverage remain visible. There is no trade execution.
- Portfolio covariance attribution on aligned, short-interval current-weight returns. Shares of variance can be negative. Historical one-day 95% VaR and expected shortfall require 60 observations; shorter samples stay unavailable. This is not a factor-risk model or a guaranteed maximum loss. Daily closes are selected chronologically and long gaps are omitted from correlations as well as annualized risk.
- Bond cash-flow lab: explicitly entered dates/payments, dirty/clean price, coupon-period accrual, numerical modified duration, convexity, DV01 and exact/approximate yield-shock P/L. ACT/365 nominal-yield discounting and actual/actual coupon accrual are disclosed. Irregular coupons are not supported. This is not a verified CBK curve, tax calculation or exchange settlement quote.
- Futures lab: explicit contract multiplier, side, quantity, settlement, collateral, expiry and price shock; notional, mark-to-market and stressed collateral. No options, margin-call algorithm or live contract feed is claimed.
- Calculated Ask Engine includes the new diagnostic checks and portfolio risk attribution. Company answers link the latest reviewed filing where available. No generative AI API is needed for this mode.
- Source-backed total-return calculation primitive rejects missing action-day closes, duplicate actions, missing provenance and ambiguous simultaneous split/dividend basis. It is deliberately **not** exposed as a verified total-return feed: a reviewed dividend/split ledger and proven raw-price basis are still needed.

Research references: [Aladdin Risk](https://www.blackrock.com/aladdin/platforms/products/aladdin-risk), [Bloomberg PORT](https://professional.bloomberg.com/products/bloomberg-terminal/portfolio-analytics/), [FINRA bond yield and return](https://www.finra.org/investors/investing/investment-products/bonds/understanding-bond-yield-and-return), [CME futures P/L](https://www.cmegroup.com/education/courses/introduction-to-futures/calculating-futures-contract-profit-or-loss), [CBK Treasury bonds](https://www.centralbank.go.ke/securities/treasury-bonds/).

### Additional verified archive publication

- NSE extraction 5120: Kakuzi audited group FY2017 report, one page visually reviewed. FY2016 and FY2017 income/EPS and balance facts are published. Cash-flow history is not supplied. Gross assets and liabilities are reconstructed from the explicit net-assets presentation, with both equity and net-current-asset reconciliations. The source date is 22 March 2018, not an invented comparative-year release date.
- Its backend issuer record was absent and its company had the ticker-only placeholder `KUKZ`. Migration `20261011160000_kakuzi_archive_identity.sql` restores the issuer already in the app directory, replacing only that placeholder; no prices are seeded. Identity confirmed on the [issuer's website](https://www.kakuzi.co.ke/).
- NSE extraction 5383: KCB audited FY2017 disclosure, all three PDF pages visually reviewed. Only the last two consolidated columns are mapped to FY2016/FY2017 income/EPS and balance facts. Bank-only and parent-company figures are excluded. Income/tax and A=L+E reconcile. Availability is the stated board date, 7 March 2018. No cash-flow statement is invented.
- `backend/scripts/verifyEngineArchiveExpansion.ts` verifies all four canonical annual periods and their reviewed source URLs; both documents have published validation outcomes. Publication refreshes shared Engine/ratio caches only after successful transaction commit.

### Still data-dependent — not represented as complete

Unknown issuer aliases, OCR/scanned pages, half-year YTD versus standalone-quarter layouts, other bank/issuer templates, unsupported CBK signed results and canonical conflicts remain review cases. Non-PDF documents are not silently treated as validated annual statements: only the exact registered Kakuzi five-year HTML layout has a new deterministic mapping. Missing years, share counts, corporate-action basis, yield curves, contract settlement history and audited factor exposures are not manufactured. These limits prevent claiming Aladdin/Bloomberg-level coverage or statistical calibration.

### Verified non-PDF layout

The [official Kakuzi five-year record](https://www.kakuzi.co.ke/five-year-record) supports FY2021–FY2025 revenue, attributable earnings and EPS, including the FY2024 loss. The mapping requires the exact official source/path, five dated/unit-labelled columns, unique numeric rows and comprehensive-income reconciliation. Monetary figures are scaled from KES thousands, EPS remains in shillings. December year-end is confirmed by the issuer's [2025 annual report](https://www.kakuzi.co.ke/company-reports). Unknown balance-sheet totals and cash flows stay unavailable. Availability is conservatively the archive observation, not a fabricated original filing date. A changed rolling-year layout requires a new reviewed validator version. The scraper retains HTML in its private raw archive just as it does PDFs; publication uses the same atomic canonical history and review ledger.

Production artifact 9155 / extraction 8134 passed validation and published all five income periods. The read-only expansion verification checks all nine added annual periods, including the signed loss and reviewed source URLs. `scraper/scripts/collectKakuziRecord.ts --remote` can use the deployed private collector without copying its storage credentials; `--retry-failed` requeues only that specific failed issuer page. Unchanged/conflicting canonical statements are never silently replaced.

### Verification for this expansion

- Backend: 305 tests passed; six existing opt-in database tests skipped. Backend typecheck/build passed.
- App: 76 tests passed; application TypeScript check, production build and lint on all changed app files passed. Risk-lab form layout was visually checked at mobile width.
- Scraper: all 56 tests passed with Poppler on PATH, matching the deployed Docker extraction runtime; typecheck/build passed.
- Kakuzi identity migration applied and checked in the production migration ledger. Four PDF annual periods and five HTML annual periods passed read-only canonical/source verification. No user holdings, transactions or raw reports were deleted.
- Archive latest-outcome audit still lists review cases: 78 exact-issuer identity cases, 54 OCR/non-native cases, 13 unsupported CBK layouts, nine approval-date cases and one conflicting bond observation. These are not labelled published and are not filled with inferred numbers.

Archive inspection now reports the latest validation per extraction, not duplicate version counts. Read-only commands: `npx tsx scripts/inspectArchiveLayouts.ts`, `npx tsx scripts/inspectArchiveLayouts.ts --extraction=5120`, and `npx tsx scripts/verifyEngineArchiveExpansion.ts` from backend. Publication is bounded and re-entrant; source-specific validators fail closed into the existing review queue.
