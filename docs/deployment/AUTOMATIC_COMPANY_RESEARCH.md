# Automatic company research and persistent daily charts

The normal Python scheduled collector invokes `ResearchProcessor.run` before and
after collection. No issuer-specific operator command is required. Private raw
evidence stays in R2; processed per-view research and company assemblies stay in
Supabase. The existing 192 MiB/day collection budget is unchanged.

After processing, the Python Engine assembles each issuer's current permitted
financial categories and overview into `companyResearch` on the newest evidence
receipt. It uses exact source-labelled annual fields, statement-over-summary
precedence, same-year ratios and decimal division. Conflicts and missing inputs
remain unknown. Presentation version 3 upgrades earlier eligible receipts on
the next bounded processing pass.

The chart API reads validated daily OHLCV observations from **all** retained
history receipts, not just the latest page or a browser quote. New observations
therefore do not erase previous dates when the publisher's window moves. Newest
publisher revisions win within a date; existing canonical candles win across
sources. Current permission, private R2 and SHA evidence gates apply on every
read. Week/month/year aggregation continues to use the merged daily series.
Adjustment remains explicitly unknown. No percentage change is turned into
invented OHLC prices or an intraday path.

Annual earnings figures can be shown without pretending an earnings-release
date exists. Event studies still require real release dates. Analyst estimates,
headcount, share counts, fair-value model inputs and economic-moat assessments
cannot be invented merely because historical statements have arrived. A missing
model-based Value Signal is not a technical error when required inputs are absent.
