# Research delivery investigation — 16 October 2026

## Verified live facts

- Both scheduled news and scheduled documents repository variables are true.
- DB-only inventory run 38934230243 verifies KenyanStocks, NSE reports/index
  summary, CBK bond/bill sources and issuer filings enabled. Only hn-test is off.
  An enabled source does not itself grant redistribution or approve its mapping.
- KenyanStocks has 689 extraction records, 39 with private R2 evidence, 541 with
  a known issuer and 689 passing its recorded source-permission gate.
- The run processed 100 legacy records into blocked receipts because their
  originals are not verified in private R2. It published no new financial series.
  Do not remove that evidence gate or call this a completed financial backfill.
- Fresh bounded KenyanStocks drain 38934805849 on dab9e3c returned budget-paused
  before source downloads. It did not fetch a financial statement. The shared
  UTC allowance must reset before another reserved run can proceed; no counter
  was reset and no spending ceiling was raised.

## Implemented fixes

The frontend financial-tables component now reads processed observations first,
retains the older extraction fallback when that read succeeds but is empty,
expands available tables and shows request failures with retry instead of
silently hiding them. This does not promote rounded publisher observations into
verified financial cards, ratios or valuation inputs.

The JavaScript reference queried collected research too late, after deciding
whether to observe a complete snapshot. Python omitted the new response field,
and the differential fixture did not inject the new dependency. Collected
research is now an ordinary optional input in both assemblies and native Go.
Five differential cases include nonempty observations and a publisher outage.
CI run 38934163450 passed after this repair (commit d62d7e3).

KenyanStocks now claims Financials first while retaining every other tab/PDF
lane. Primary and fallback batch sizes are configurable, validated 1–100;
defaults and existing transfer/time/source limits are unchanged. Source data,
accounting periods and missing values were not hardcoded to populate the UI.

## Outstanding, not completed

Verify a real new Financials → private R2 → Python processing → Supabase → app
run after the budget reset. The public frontend change alone cannot create
uncollected or unverified evidence. Unknown document templates still require
accounting validation before canonical publication.

The native production rewrite is not complete. Its feature ledger still records
260 partial, 35 ported and 92 retained entries. These are source-feature counts,
not a completion percentage. Do not remove the live Node rollback, production
guard or release requirements merely because the repaired candidate CI is green.
