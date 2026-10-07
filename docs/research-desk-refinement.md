# Research desk refinement

## Reliability

PostgreSQL DATE and TIMESTAMPTZ previously arrived as Date objects although
repository contracts promise ISO strings. Portfolio session grouping and candle
alignment used `.slice()` and could throw. DATE now retains its calendar day;
TIMESTAMPTZ is normalized to UTC ISO text at the database boundary. A regression
also passes an actual Date through premium/free portfolio quote handling.

Missing or failed snapshot/cash-flow persistence no longer takes down live
holdings analysis. Returns remain unavailable, never calculated against invented
zero flows. Server logs retain failure diagnostics. Database connections and
statements have finite deadlines. Optional company feeds have six-second
deadlines and retain explicit unavailable-feed labels. Read-only Engine requests
retry transient 5xx errors once; authentication and quota errors and mutations
are not replayed.

TradersHub onboarding now signals completion when an existing server-side
account is detected, even without a local device flag. Previously the feed
remained gated until a second visit. Storage restrictions do not block that
handoff. Route loading now keeps the app shell and bottom navigation mounted.
Page-module download failures retry once; a route-scoped error boundary keeps
navigation mounted and offers a reload when recovery is not possible. Application
exceptions are not automatically re-executed.

## Design and tools

Markets section spacing is approximately halved without reducing touch targets.
Home, Portfolio and TradersHub share the flat research-desk typography, rules,
theme tokens and responsive layout. Home and Portfolio have two-column desktop
layouts while retaining mobile content ordering. Header Engine access is on
Home, Markets and Portfolio; Markets adds Watchlist, Heatmap and Calendar.

The portfolio review desk offers concentration limits, sector stress
assumptions, a zero-return contribution planner, evidence review queue and JSON
export. Assumptions are temporary and do not create trades. Observed dividend
income discloses coverage; absent data is not presented as zero income. Journal
entries retain account/exchange/symbol isolation and now include thesis status,
invalidation conditions and a next-review date, saved only on that device.

Dashboard hierarchy and allocation/planning workflow were informed by primary
product references, not copied:
- https://www.interactivebrokers.com/en/portfolioanalyst/features.php
- https://www.schwab.com/digital-platform/web

## Cleanup and verification

Removed 31 orphaned legacy application components after checking their module
names against tracked source, tests, config and documentation. There are no
glob/context module loaders in the app. Reusable UI primitives, active assets,
migrations and operational scripts are preserved. Deleted sources remain
recoverable in Git history.

Regression coverage includes actual PostgreSQL date parsers, optional storage
outages, allocation/stress/planning math, first-visit onboarding without a device
flag, Engine review controls and existing app browser smoke scenarios.

Live authenticated production portfolio verification still requires a deployed
backend and the affected user's session. Local fixture and regression success
does not itself confirm Render deployment or live database migrations.
