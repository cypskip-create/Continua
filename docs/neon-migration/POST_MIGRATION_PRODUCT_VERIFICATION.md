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


### Final security and regression follow-up

Current root, backend and scraper npm audits contain zero vulnerabilities after updating body-parser to 2.4.0 and undici to 7.30.1. Miniflare's exact vulnerable transitive undici dependency is overridden at compatible major version 7; Wrangler is not downgraded. Advisory references: https://github.com/advisories/GHSA-27r3-jxmh-p828 and https://github.com/advisories/GHSA-xjj6-f33q-929c.

The Zod security upgrade changes Unicode string-length handling. Explicit review-note UTF-16 limits preserve the existing publication boundary and native Python parity. All 12 historical-confirmation and 24 alert parity fixtures pass; the full CI parity suite remains required. Backend regression: 559 passed, 18 skipped. Frontend: 162 passed. Edge: 35 passed. Display cache owner isolation/expiry and sign-out cleanup are tested. Private cached watchlists remain visible if only a background refresh fails.


## Rolling-number presentation follow-up

The existing shared RollingNumber renderer now covers numeric readouts throughout Home, Portfolio, market lists, stock details, shared chart headers, forecast/research panels, and counters. SVG axes and editable form controls retain their native rendering. Digits align by place, respect signed currency changes, and animate only between exact observations. The 160ms transform animation retargets rapid updates without queuing older values. Memoized static values initially render as text; digit layers retire after 180ms to keep large tables light. Reduced-motion CSS disables movement, and assistive text contains only the latest formatted value.

Validation: 164 frontend tests passed, including negative currency direction, digit rollover, owner-scoped cache and privacy masking checks. The isolated browser QA used synthetic values updated every 70ms; moving digits used a 0.16s animation and settled at the exact final value with zero remaining motion layers. No production financial inputs or precision were changed.

### Cloudflare automatic build compatibility
- Cloudflare npm 10.9.2 did not apply the nested Miniflare undici override, so clean installation rejected the npm 11 lockfile.
- Applied the patched undici 7.30.1 override at the workspace root; regenerated the lockfile with npm 10.9.2.
- Exact npm 10.9.2 ci dry-run passes; npm audit reports zero vulnerabilities. Application code and scheduled triggers are unchanged.

### Public site and chart interaction revision
- Rebuilt the public landing page around spacious product groups, restrained manual story transitions and current plan capabilities. Documentation and API resources are grouped. Removed illustrative portfolio previews and decorative logo framing. Buttons have rounded rectangular corners.
- Replaced the initial vector turbine after user feedback with built-in image generation: original graphite/platinum computational research core with violet glass conduits on dark aubergine, no text, logos, UI or aircraft engine. Project asset: app/public/landing/engine-intelligence.webp (90,592 bytes).
- Home and Portfolio now select from the full plot using pointer capture; fixture browser drags begun below both curves produced successive exact header values. Time-scaled Home selection accounts for gaps between trading dates. Existing numerical inputs are unchanged.
- Number wheels use continuously retargeted springs with reduced-motion support. No fabricated market observations are added.
- TradersHub reuses owner-scoped five-minute session snapshots with allowlisted display fields, clears them on logout/safety edits, and reads posts/safety settings concurrently before exposing refreshed rows. First visible post images get priority; new large static post images are compressed client-side before upload.
- 166 frontend tests pass, including owner isolation, snapshot expiry/credential exclusion and plot-edge selection.

### Featured-product automatic carousel
- At the user's request, the hero now rotates every seven seconds through Engine, Portfolio, TradersHub and Stock Research, with synchronized glowing progress bars and matching section links.
- Manual selection restarts that slide's progress. Pause/Play is available; hidden tabs, off-screen heroes and reduced-motion settings suspend automatic rotation.
- Browser QA observed automatic advancement, the Portfolio CTA targeting its existing section and a paused progress animation. All 166 frontend tests and the production build pass.

### Matching imagery, feature detail pages and compact header
- Hero images now follow the selected slide. Portfolio and TradersHub use the actual app screenshots requested for the public website; Stock Research retains the approved generated illustration and Engine retains its original artwork. Original values and chart history are unchanged.
- Discover more and feature titles open public explanations at /features/company-research, /features/markets-charts and /features/monitoring. Each page covers supported tools, getting started and plan access. Developers & API is linked in desktop and mobile navigation.
- Header reduced to 62 px desktop and 54 px mobile, with smaller brand artwork and matching menu/anchor offsets.
- Browser QA traversed all three detail pages and confirmed matching portfolio imagery. All 166 frontend tests pass; TypeScript and production build are checked before release.

### Stock-details full-surface chart scrubbing
- StockPriceChart now uses the same shared horizontal time-selection helper as Home, with capture-phase pointer events on the full pane. Captured drags clamp at chart edges and are not cleared by SVG/chart leave events.
- Explicit pointer release/cancel handling preserves pinned crosshairs; drawing tools and price-axis zoom retain their own interactions. Both embedded and fullscreen price charts use this component.
- Browser QA dragged below the plotted data across area, line and candlestick modes. Every mode reported the same successive selected prices (104.36 through 118.60 on the synthetic fixture). All 166 frontend tests, TypeScript and the production build pass.
