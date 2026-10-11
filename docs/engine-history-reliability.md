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
3. Complete bond cash-flow, accrued-interest and curve inputs before duration/convexity or yield stress claims. Derivatives require contract specifications, settlement history and expiry handling.
4. Extend existing portfolio scenarios with explicit factor coverage and validation against reference calculations. Sparse NSE prices must not imply institutional statistical confidence.
5. Continue conservative financial-news filtering and issuer evidence. User preferences affect presentation, not the underlying reported figures or entitlement security.

The Engine owns validated facts and calculations. The app renders shared chart series responsively; server-rendering chart images would remove interaction and is not necessary for central ownership of the data/analysis.
