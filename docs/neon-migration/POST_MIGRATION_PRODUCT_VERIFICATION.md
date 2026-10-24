# Post-migration product verification — 23 October 2026

Runtime: existing JavaScript API/collectors, isolated Python calculations, PostgreSQL guarantees, React UI. Native Go remains an incomplete candidate and fails closed on account routes after retirement of its former-provider verifier.

## User-facing changes

- Official NSE NASI/NSE20/NSE25, shares, equity turnover, ETF units/deals and ETF KES. NSE10 hidden; historical rows retained.
- Processing counters, raw JSON/calculations, developer connection notes and research-source hyperlinks removed from ordinary views. Financial limitations and readable methodology remain.
- Common reported closing-price history for stock/Home/Portfolio charts; portfolio values use actual current share quantities, bounded seven-day carry and withhold incomplete valuations. No artificial intraday or endpoint prices.
- Fullscreen stock chart remounts the embedded chart on exit. Shared dialog/sheet controls follow the visible keyboard viewport; drawers retain input repositioning.
- Engine tables retain readable column widths and horizontal scrolling. Quick Watch completes its cycle in 38 seconds (formerly 85), with reduced motion retained.
- Forecast/research exports produce paginated PDFs. Personal account data portability remains structured JSON.
- Portfolio health aggregates canonical sector-aware company scores, weighted by actual quoted holdings value; any unpriced holding or under-60% coverage withholds a measure. The old gain/count-based health heuristic is removed.
- Portfolio company reads use bounded two-way batches instead of simultaneous requests per holding. Identical in-flight private reads are deduplicated within the exact access-token scope; no responses persist after settlement. Hidden paid Fundamentals and closed financial-health/past-performance details wait until opened. Calculator bursts queue within the existing two-process limit, with reserved risk capacity and deadlines.

## Tier delivery

Free retains basic portfolio overview/health, public market information, existing price/technical alerts and current macro/events/liquidity access. Premium retains expanded fundamentals, forecasts, valuation, ownership, financial reports, portfolio analysis and company research, and adds 20 advanced price/return/volume/financial alerts. Premium Plus retains the full Engine, scenario/benchmark/replay/factor research, stress/bond/futures calculators, private forecast notebook, peers, optimization/backtesting, journal and preferences, and adds 50 alerts including material-research changes, cash conversion and quote freshness. Rules are owner-bound and server-tier checked; count limits are enforced under a transaction/advisory lock. Missing/stale inputs never trigger an alert, repeated crossings are deduplicated, and pause/history controls remain available.

Paid AI and always-on infrastructure remain disabled under the standing project instruction. Data-dependent research can be unavailable when disclosures/history are missing; entitlements do not fabricate evidence. No billing, payment, marketing email or account-password changes are part of this release.

## Former-provider retirement

Browser SDK/dependencies and auth fallback removed; owned identity transport only. Edge legacy session endpoints return 410 and cannot contact the retired provider. Backend auth is Better Auth only. Collector runtime is R2-only; optional legacy credentials cannot construct a former-provider reader. GitHub former-provider deployment workflow removed and source-project GitHub integration disabled; Vercel source-project sync detached and its installed Supabase authorization removed with explicit approval of the legal acknowledgement. Vercel has no Supabase environment variables. Offline migration tools, SQL history and encrypted recovery backups remain for audit and do not run as app services. Former source data/account remain intact.

Release validation: 559 backend tests, 161 frontend tests, 96 collector tests, 35 edge tests; frontend/backend/collector type checks and production build. Server-secret browser scan compares 14 protected configuration values with no matches. Newly reported Zod advisories patched to 4.6.7; old declaration-only Zod contracts use type imports from the bundled v3 namespace (no runtime v3 import).


## 24 October mobile chart and startup follow-up

- Shared line/area chart readouts occupy a reserved header, never a floating box over plotted data. Values use two decimal places; research lines use 1.5px strokes.
- Home historical value and cost-basis return update together during inspection; selected-window direction colors its area red/green. Portfolio uses area shading with its existing header readout.
- Stock-chart pointer capture tracks across SVG fills and paths while excluding drawing tools and the draggable price axis.
- Watchlists share an owner-keyed query and validated 24-hour private display snapshot. Loading, request failure, missing quotes and an empty watchlist are distinct. Session cleanup removes those snapshots. Public quotes, current observed-history and valuation query versions hydrate before React renders; refresh retains original data timestamps.
- SVG stars show the canonical Engine rating. Unrated companies show neutral outlines and a reason. Production EQTY currently has fewer than two usable valuation models; no EPS, balance-sheet inputs or rating is fabricated to fill this gap.
- Supabase GitHub installation removal confirmed in GitHub; Neon/Render/Cloudflare remain installed. Removal revokes the former app's account-wide repository permissions without deleting source data.
- Targeted history collection run 40012261174 succeeded; subsequent scheduled run 40062754614 succeeded. Collection schedules and hourly housekeeping remain enabled.
- Returning visits benefit from cached data. First visits, session verification, unavailable evidence and free Render cold starts still require live work; background execution while the browser is closed is not promised.
