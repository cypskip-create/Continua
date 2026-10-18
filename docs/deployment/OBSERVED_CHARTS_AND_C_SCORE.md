# Observed charts, key statistics and C score

Timeframe, chart type and indicator choices persist across issuer navigation and
reloads. If browser storage is blocked, preferences remain in memory for the
current app session. An unsupported chart type retains the user's selection and
explains the missing evidence instead of switching it automatically.

The chart consumes existing canonical OHLC and the separate close-only history
contract. No source document is parsed in the browser. Conflicting supplemental
same-day closes are withheld; valid canonical bars take precedence. Closing
prices do not manufacture opens, highs, lows or volume. Quote open/latest pairs
are no longer drawn as intraday candles. No intraday feed currently means no
1D chart. Hover prices are the actual observed values, not a percentage applied
to today's price. The numeric time axis preserves actual observation dates.

Range display requires two distinct observations, near-boundary coverage and a
minimum sample of 60% of estimated weekday observations, with no gap longer
than ten days. These are conservative display rules, not an exchange calendar
or a guarantee of complete history. ALL shows the retained observed span.
Missing values remain unavailable. High/low-dependent indicators require actual
OHLC; close-only series retain the selections while explaining unavailable
indicators. Unknown volume is not a zero-volume bar.

`GET /statistics/:symbol` computes source-backed key statistics in the backend.
Market capitalization uses the reported quote or price times reported shares,
with the share-date basis disclosed. P/E requires positive EPS. The 52-week
observed range requires at least 150 dated observations, near both boundaries
and no gap longer than ten days. Close-only extrema are explicitly labelled;
neither is represented as a guaranteed complete exchange record. Missing shares,
prices or coverage never create an estimated statistic. Unknown filing dates
remain unknown rather than deleting otherwise available financial observations.

## C score

The display name is **C score** (Continua score). Legacy `afri*` wire/database
field names remain for compatibility. The one numerical implementation is
`backend/python/engine_calculations.py`, shared with the native candidate. The
existing bounded calculator receives no database, payment or provider secrets.
There is no frontend score heuristic or missing-data default of 50.

Version `continua-c-score-v2` reports valuation, growth, financial strength,
income, risk, quality and momentum separately. Every observed metric includes
its raw input, threshold anchors and weight. Metrics are bounded to 0–100, and
only observed applicable inputs contribute. Overall scoring needs 60% weighted
metric coverage, at least four observed pillars, and observed valuation,
financial-strength and quality pillars. Otherwise the overall result is NULL.
Coverage is evidence completeness, not investment quality or predictive accuracy.

General weights are 20/15/20/10/15/15/5%. Banking and insurance use
25/15/20/10/10/15/5%. Investment companies use 30/5/10/20/20/10/5%.
Banks require NPL and regulatory-capital evidence for financial strength;
insurers require solvency/combined-ratio evidence. Generic current ratio and
debt/equity are not substituted for those measures. Unavailable regulatory
evidence therefore prevents a full overall score. Investment-company valuation
uses book multiples rather than industrial EV/EBITDA. Negative valuation
denominators are not treated as cheapness; non-payers do not get a dividend
sustainability bonus. Source observations with unknown filing dates remain
qualified as limited evidence, not point-in-time reviewed history.

Ratios and score snapshots persist in one transaction. Cached old-method scores
are withheld, and current research refreshes on quote changes or after one
minute. Registry-wide refresh continues every six hours in the existing backend
under a database advisory lock, a ten-minute per-exchange budget and independent
issuer failure handling. It uses the live registry, not a ticker list. Raw
archive migration remains a separate finite, budgeted job.

This C score is distinct from a price/fair-value star assessment. Its thresholds
are disclosed research assumptions, not calibrated investment recommendations.
No out-of-sample accuracy or forecast success rate is claimed. The company
bundle's separately dated reviewed analysis retains stricter point-in-time
eligibility; current publisher observations do not become historical forecasts.

Validation on 2026-10-18: 458 backend tests (six optional tests skipped), 120 frontend tests, 113 Python Engine
tests, 74 disposable PostgreSQL checks, Go tests/vet, 491 Engine numerical parity
cases, six company-bundle parity cases and 26 valuation parity cases passed.
The production build and declaration checks passed. Hosted data coverage and
native production-cutover gates remain separate from these fixture results.

## Engine value rating v3 and provider corrections

The fair-value star assessment now runs in the same isolated Python Engine,
shared with the native candidate. Browsers display the versioned result without
recreating stars from cached model arrays. A rating needs at least two positive
matching-price models, a dated quote within seven days and model spread no more
than 50% of the median. Mixed model agreement widens the disclosed upside bands.
These are screening assumptions, not calibrated probabilities or licensed
Morningstar research. Unknown and contradictory evidence stays unrated.

The active production provider is MyStocks (confirmed in Render). Its existing
reported market-cap field now reaches the quote contract, with abbreviated
currency units converted exactly once. Missing/inconsistent required quote
fields withhold the update rather than becoming zeros. AFX volume suffixes are
converted to share counts, and its reported capitalization is retained too.
Both providers historically wrote close-only history in a flat OHLC transport;
OHLC/high-low/average-volume reads now exclude these records. The separate
close-history response exposes their actual close, with absent O/H/L and
MyStocks daily volume NULL. Legacy rows are preserved. UTC date boundaries are
explicit and tested against a non-UTC database environment.

Updated validation: 463 backend tests passed (six optional skipped), 119 frontend
tests passed, 75 disposable PostgreSQL checks and 26 native valuation parity
cases passed. Frontend/backend type checks and production browser build audit
passed (171 artifacts; no secret-pattern findings). The source schema remains
undocumented and must be reverified if the provider changes it.
