# Fundamentals presentation

Stock details retain Financials, Shareholders, Dividends and Profile. Financials
previews open full-screen detail panels; closing a panel preserves the underlying
stock and scroll position. All text uses the user's existing root font scale.

## Views and provenance

- Earnings Hub: reported earnings events; net income and YoY use a matching filed
  period. Missing consensus estimates are never counted as a zero surprise.
- Financial detail: Indicators, Income Statement, Balance Sheet and Cash Flows.
  Annual and quarterly history remain separate. Tables scroll horizontally with
  sticky metric names. YoY matches the same quarter or annual period a year ago.
- Valuation: P/E, P/B and P/S. Historical ratios use annual filings only after their
  reported dates; P/B and P/S also require disclosed shares outstanding. The band
  is the middle 50% of observed ratios, not a recommended fair-value range.
  Sector and market comparisons use the returned screener sample, not a claim of
  full-exchange coverage. No historical industry benchmark is manufactured.
- Research: available Continua fair-value models and reported ratios, explicitly
  separate from Morningstar and third-party analyst opinions.
- Forecast detail: available revenue/EPS estimates. Price history is not extended
  with a fabricated analyst cone; consensus filters explain missing coverage.
- Earnings moves: pre-release to post-release closes, excluding gaps over seven
  calendar days. Without release times this is an observation, not a causal
  earnings-event return. Strategy Lab is an illustrative share-position scenario,
  not an options strategy or a probability forecast.
- Shareholders: one latest dated disclosure snapshot, deduplicated by holder.
  Percentages above 100% withhold the donut. Institution totals include disclosed
  institutions only; unavailable history is not inferred.
- Operational efficiency: current-profile headcount can illustrate latest annual
  revenue per employee, but is explicitly mixed-date and never applied to historical
  years. A dated employee-history source is needed for the reference trend.

## Remaining source coverage

The feed does not supply business/geographic segment revenue, company-specific
operating KPIs, earnings-call transcripts, analyst targets/ratings, moat ratings,
options-implied move ranges or institutional holdings history. These views show
explicit coverage states, not AMD data or invented NSE equivalents.

Financial numbers use K/M/B/T units. All missing inputs remain em dashes; zero is
a real value. Income-based quarterly returns are not silently annualised.
