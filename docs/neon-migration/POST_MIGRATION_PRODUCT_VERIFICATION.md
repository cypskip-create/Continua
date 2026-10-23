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
- Portfolio company reads use bounded two-way batches instead of simultaneous requests per holding. Calculator bursts queue within the existing two-process limit, with reserved risk capacity and deadlines.

## Tier delivery

Free retains basic portfolio overview/health, public market information, existing price/technical alerts and current macro/events/liquidity access. Premium retains expanded fundamentals, forecasts, valuation, ownership, financial reports, portfolio analysis and company research, and adds 20 advanced price/return/volume/financial alerts. Premium Plus retains the full Engine, scenario/benchmark/replay/factor research, stress/bond/futures calculators, private forecast notebook, peers, optimization/backtesting, journal and preferences, and adds 50 alerts including material-research changes, cash conversion and quote freshness. Rules are owner-bound and server-tier checked; count limits are enforced under a transaction/advisory lock. Missing/stale inputs never trigger an alert, repeated crossings are deduplicated, and pause/history controls remain available.

Paid AI and always-on infrastructure remain disabled under the standing project instruction. Data-dependent research can be unavailable when disclosures/history are missing; entitlements do not fabricate evidence. No billing, payment, marketing email or account-password changes are part of this release.

## Former-provider retirement

Browser SDK/dependencies and auth fallback removed; owned identity transport only. Edge legacy session endpoints return 410 and cannot contact the retired provider. Backend auth is Better Auth only. Collector runtime is R2-only; optional legacy credentials cannot construct a former-provider reader. GitHub former-provider deployment workflow removed and source-project GitHub integration disabled; Vercel source-project sync detached. Offline migration tools, SQL history and encrypted recovery backups remain for audit and do not run as app services. Former source data/account remain intact.
