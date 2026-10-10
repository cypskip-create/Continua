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

## Forecast and premium access

Fundamentals categories are Financials, Forecast, Shareholders, Dividends and Profile. Financials groups reported earnings, statements, indicators, operations, financial health and descriptive valuation history. Forecast collects the value signal, scorecard, financial estimates, growth/risk context and scenarios. The same CompanyForecast component powers the Engine Forecast tool; old Engine Focus links resolve to Forecast.

Basic ratings, methodology, scorecards, sourced estimates, growth/risk context and model-price illustrations remain free within the existing five-distinct-stock monthly Fundamentals allowance. Premium expands these with per-model inputs, rating-band sensitivity, financial evidence and adjustable price scenarios. The expanded section checks the profile and authenticated, subscriber-protected Engine endpoint before mounting its children. Locked previews contain only static masked shapes, not blurred sensitive output. API failures and membership denials fail closed for expanded research, without hiding free basics. The Engine workspace itself remains subscriber-only. Model evidence inside descriptive valuation details is gated as well.

The Continua Value Signal uses the median of positive model values whose prices match the reference quote within 1%. It widens rating bands when models disagree or coverage is limited. Model agreement is not analyst uncertainty, a confidence interval or validated predictive accuracy. The basic price chart is explicitly an assumed convergence illustration, never an invented analyst target. The research report explains source coverage and missing freshness metadata. Morningstar's [stock-rating explanation](https://www.morningstar.com/investing-terms/morningstar-rating-for-stocks) informed the separation of rating and deeper explanation; Continua does not reproduce or claim a Morningstar rating, moat assessment or licensed analyst research.

Fundamentals bar series share a 22px thickness, including grouped assets/liabilities and horizontal comparison bars. Price-chart candle and volume widths are intentionally separate.
