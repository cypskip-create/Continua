# Engine reliability and workspace upgrades

## Research and design decisions

Reviewed 11 October 2026. Borrow workflow principles, not branding,
proprietary risk models, datasets, or claims of institutional equivalence.

- [BlackRock Aladdin Risk](https://www.blackrock.com/aladdin/platforms/products/aladdin-risk): connected portfolio data, explainable risk drivers, scenarios and auditable exceptions. Continua already has portfolio, bond and futures labs; this release adds scenario starting points and actionable evidence exceptions rather than uncalibrated factor-risk claims.
- [Bloomberg PORT](https://professional.bloomberg.com/products/bloomberg-terminal/portfolio-analytics/): validated inputs, shared workflows and dependency-aware orchestration. The implemented lesson is consistent dated calculations, publication-aware cache invalidation and bounded last-good retention.
- [S&P Capital IQ Pro](https://www.spglobal.com/market-intelligence/en/solutions/products/sp-capital-iq-pro): standardized statements and auditable research workflows. Continua adds a financial coverage matrix and deterministic evidence snapshots, alongside its existing field-level source ledger.
- [FactSet stress research](https://insight.factset.com/modeling-portfolio-risk-amid-market-uncertainty): inspect different scenarios and their assumptions. Continua adds a transparent EPS/multiple grid and reverse break-even calculation. Presets are generic illustrations, not calibrated historical-event reconstructions.

## Suggestions implemented in this release

1. Evidence-readiness desk available in paid company research.
2. Financial coverage matrix distinguishing missing fields from reported zero.
3. Explicit annual-year gaps; no adjacent-year growth over sparse endpoints.
4. Missing/future source-date checks and duplicate-period exceptions.
5. Old-financial and stale-quote warnings.
6. Separate research retrieval time from market/filing observation time.
7. Available/limited/unavailable input coverage for financials, growth, technicals, analyst estimates and ownership.
8. Human-readable exceptions linked to the appropriate research tool.
9. Stable SHA-256 financial/quote evidence fingerprint; excludes retrieval time.
10. Versioned research-method contract and exported evidence-readiness snapshots.
11. Engine briefing ratios calculated from the bundle's reviewed, dated inputs, not a separately cached P/E.
12. Future/untraceable financials and mock/future quote guards in those calculations.
13. Company score recalculated from those ratios; growth inputs require consecutive years. This is the existing simple score, not an Aladdin model. Uncovered dimensions are not evidence of low risk.
14. Dividend ratios use the quote-date trailing window.
15. Last-good financial research retained on partial quote/statement request failure, with original generatedAt and remaining retention lifetime.
16. Shared cache-key versions between readers and validated-document publisher to prevent stale-version invalidation bugs.
17. Searchable tool navigation with visible plan requirements and empty-search guidance.
18. Guided evidence → reported results → assumptions shortcuts.
19. Wider desktop research workspace with responsive evidence cards/matrix; correct Free/Premium/Plus header labels.
20. Server-calculated nine-cell earnings-growth × exit-P/E sensitivity grid.
21. Reverse break-even EPS growth, clearly excluding dividends, dilution and costs.
22. Total and annualized hypothetical price changes, with unchanged-share-basis assumptions shown.
23. Dated EPS source and evidence fingerprint retained in sensitivity exports; edited controls never silently relabel prior results.
24. Illustrative portfolio decline/rebound presets; no invented historical-event probabilities.
25. Server-side Premium Plus authorization and bounded request schema for sensitivity calculations; no paid LLM dependency.
26. Relative valuation uses reported EPS directly and fresh, source-backed same-fiscal-year peer multiples; it never derives EPS backwards from a cached P/E. Fewer than three comparable peers remains unavailable.
27. Lightweight export component separated from heavy research workbenches, keeping the evidence desk independently renderable without starting API/auth dependencies.

No schema migration is needed. The automatic archive/extraction/publication
workers remain responsible for documents; this release does not assert that
the unsupported scanned-layout backlog or every missing year is complete.

## Further suggestions and real dependencies

These are not represented as implemented institutional capabilities:

| Suggestion | Required foundation before reliable rollout |
|---|---|
| Corporate-action-adjusted total-return histories | Licensed continuous prices, verified split/rights/dividend events and a documented adjustment policy; raw closes alone are insufficient |
| Benchmark attribution and information ratio | Synchronized benchmark history, portfolio cash flows, fees and explicit rebalancing rules |
| Multi-factor risk and calibrated VaR/expected shortfall | Sufficient aligned history, validated factor exposures, regime checks and out-of-sample coverage tests |
| Historical event replay and Monte Carlo | Adjusted observations, explicit distributions/correlations and model calibration; never infer probabilities from generic presets |
| Full cross-asset portfolio aggregation | Actual bond/futures positions, verified valuations, collateral and currency mapping; calculators alone are not holdings |
| Restatement-aware bitemporal history | Reviewed amendments, statement-scope identities and audited version policy; cannot silently replace original filings |
| Automatic OCR publication for every report layout | Issuer/layout fixtures, page/table location checks and accounting reconciliation; unsupported OCR stays in review |
| Non-sleeping isolated ingestion workers and SLO alerts | Paid always-on infrastructure and operational budget approval; code cannot remove Render free-instance sleep |
| AI multi-document answers | Funded provider, permissioned corpus, citation evaluation and cost controls; no new AI API requirement introduced here |

## Verification

Unit coverage checks deterministic fingerprints, missing vs zero, source/date
guards, quote-date valuation arithmetic, bounded sensitivities, reverse
growth and retained-cache age. Existing subscription, publication, portfolio
and risk tests must continue passing. UI results keep source dates,
assumptions, missing-input errors and last-calculation labels visible.
