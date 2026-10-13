# Engine expansion and prediction-research workflows

## Research

Reviewed 12 October 2026 using primary sources:

- [Polymarket resolution rules](https://help.polymarket.com/en/articles/13364518-how-are-prediction-markets-resolved): questions need explicit resolution rules and a resolution process. Continua borrows rule clarity, not its oracle, wagers, tokens or settlement mechanics.
- [Metaculus scoring](https://www.metaculus.com/help/scores-faq/): proper scoring discourages dishonest/extreme probabilities. Continua independently implements private binary Brier errors, not Metaculus's log, peer or time-weighted scoring.
- [Manifold calibration](https://manifold.markets/calibration): compare probability bins with observed outcomes. Continua has private calibration bins, no community odds, trading, leaderboard or rewards.

## Delivered

1. Six Premium Plus evidence labs with bounded, strict server schemas: split/dividend total return; benchmark tracking error, information ratio and beta; historical-window replay; reproducible moving-block bootstrap; same-date KES cross-asset net-value inventory; one-to-three-factor OLS research with a temporal holdout, empirical VaR/ES and holdout breach diagnostics.
2. Stored source-linked daily price loading into the lab. Missing sessions are not interpolated; each source URL is retained. Raw closes are never relabelled as total returns automatically.
3. Curves, methodology, input limits and JSON exports. Editable inputs are manual research data, not automatically approved company filings. Source URLs alone are not independent verification.
4. Private server-persisted research questions: fixed yes/no question/rules/deadline, dated append-only probability revisions, pre-deadline closure, post-deadline user-reported evidence resolution or void, initial/latest Brier error and calibration bins. No payment, position, crowd probability, rankings or rewards. Probability is the user's belief, not Engine consensus.
5. Verified owner-scoped Plus routes, row locks and immutable rule guards. Maximum 100 questions/account and 100 revisions/question. Schema rows are private to the server; public/authenticated clients have no direct table access.
6. Optional preference adaptation: explicit goal determines research shortcuts; opted-in visits produce recent-company suggestions using a 30-day half-life and one observation/company/UTC day. Older untimestamped visit counts are not treated as recent observations; first new observation starts a dated count.
7. Learning reset/disable controls and explanations. No inferred wealth, suitability or risk tolerance; no training financial models on clicks. Transaction locks prevent lost visits/settings races; stale settings forms preserve recorded interests.
8. Financial change audit: existing canonical baseline plus append-only before/after records for future period/income/balance/cash-flow changes. Source-backed Evidence shows changes with recorded timestamps. An audit timestamp is not an original publication date or restatement approval.
9. Processing-health desk shows sanitized infrastructure availability and latest recorded validation outcomes. It does not imply archive completion or universal OCR validation.

## Status of the nine earlier dependency-heavy suggestions

| Earlier suggestion | Implementation now | Remaining foundation / limitation |
|---|---|---|
| Adjusted total-return history | Split/dividend gross-reinvestment calculation and observed-history loader | Verified complete corporate-action maps; rights, withholding and unsupported events are not automated |
| Benchmark attribution/information ratio | Strictly aligned benchmark comparison, tracking error, information ratio and beta | Flow-adjusted account history and verified benchmark basis; sector/security attribution is not delivered |
| Multi-factor risk / VaR / ES | Manual-data OLS training/holdout diagnostics plus empirical tail metrics | No certified institutional calibration, production factor feed or guarantee of stable out-of-sample performance |
| Historical replay / Monte Carlo | Observed-window replay and seeded moving-block empirical resampling | No calibrated named-event library, unobserved-regime probabilities or cross-asset correlation simulation |
| Cross-asset aggregation | Same-date KES covered net-value inventory | Manual values, not connected bond/futures accounts or a unified cross-asset risk model |
| Bitemporal restatements | Recorded-time canonical baseline and change audit | Full issuer amendment identities, statement scopes and approved effective-time history still require reconciliation |
| Every-layout OCR publication | Existing fail-closed validation retained; review/published outcomes exposed | Universal OCR publication is NOT delivered; unsupported scans require issuer/layout fixtures and accounting checks |
| Always-on workers / SLO alerts | Sanitized processing health available | Paid hosting and external alert delivery remain disabled by explicit user choice; free-instance sleep remains |
| AI document answers | Existing gated assistant unchanged; no new provider connection | Paid AI disabled by explicit user choice; no key provisioning or model calls performed |

No trade execution, volume-dependent strategy, new trading UI, rewards,
leaderboard or external prediction-market data import is introduced.
These additions are research tools, not claims of Aladdin/Bloomberg equivalence.

## Migrations and verification

- `20261012010000_engine_forecast_notebook.sql`: private notebook and immutable/append-only rule guards.
- `20261012011000_financial_version_audit.sql`: canonical baseline and transactional change triggers.
- `backend/scripts/applyEngineResearchExpansion.js`: transactional dry-run/apply, migration ledger, access checks, and a rolled-back trigger probe. Canonical financial values are not changed by that probe.

Regression tests cover split/dividend arithmetic, missing dates, bounded
simulations, reproducible seeds, temporal holdout fitting, currency/date
guards, opt-in/daily observation/reset, stale preference writes, Brier errors,
deadline locking, subscription gating and owner-scoped notebook operations.
