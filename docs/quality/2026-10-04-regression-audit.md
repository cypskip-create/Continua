# Continua interaction and data audit — 4 October 2026

## Shipped changes

- Restore page-scoped pull-to-refresh. Ignore ordinary taps, upward/horizontal gestures, nested scrolling, portal dialogs and the bottom navigation. Refresh active query data plus mounted social/profile/watchlist feeds; preserve cached content and release the indicator after errors/timeouts.
- Remove overlapping pointer-up navigation and timed click suppression. A completed, unmoved touch on navigation/close controls now dispatches one normal click and cancels the browser compatibility click; mouse and keyboard keep normal handling. This also handles a first tap swallowed by momentum scrolling. Authenticated `/` now opens Home instead of the public landing page.
- Full-height news reader with one scrolling image/article area and fixed close/source-link controls. Shared dialogs, alert dialogs and sheets rise from the bottom, with reduced-motion support. Holding editor and portfolio share use these primitives. Menus/popovers remain above panels.
- Pure-white light canvas, neutral rounded surfaces, compact Inter/system sans typography across the application, and live system-theme updates. Inter is an alternative, not X's proprietary Chirp font.
- Share one user-scoped portfolio query/cache across screens; bound reads, retain cached holdings, cancel stale reads before publishing mutations, validate quantities/costs, and prevent double submission of the holding editor.
- Device-lock gate no longer renders private screens before checking lock settings; account changes reset the gate. This is a local convenience lock, not a replacement for server authorization.
- Metric bubbles use pixel-aware collision-free lanes. Missing/nonfinite data is excluded. Portfolio ratios use covered holdings consistently; weighted proxies and unavailable forecasts are explicitly labelled.
- Dividend windows are calendar-based trailing twelve months, not the last four payments. Cancelled/future ex-dividends do not count as trailing distributions. Enterprise value subtracts available cash; missing cash-flow statements no longer suppress otherwise available balance/income data.
- Daily candle top-ups rebuild complete affected calendar buckets from stored history; weeks start Monday. Coarse history reads derive from daily rows rather than mixing legacy misaligned or truncated aggregates. Candle volume is bound as a SQL parameter.
- Avoid partial-coverage portfolio history jumps. The chart explicitly describes the current-share backcast and its exclusion of trades, cash flows and dividends; it is **not** a transaction-aware total-return series.
- News receipts serialize and reuse the canonical URL record rather than failing on repeat crawls. Independent enrichment failures no longer prevent other bootstrap tasks from running. Research tolerates the pending additive P/S migration without hiding unrelated DB errors.
- Add scoped official Safaricom, KCB and Equity financial-report archive discovery. Preserve HTML table labels, periods, units and raw figures, including browser-rendered KenyanStocks tables when present. These are review candidates, not automatically trusted financial statements. Retry stale crawl jobs and revisit old documents.

## Verification

Commands below run from the repository root. Node 24 was used; the frontend test command needs Node's TypeScript strip-types support. Browser checks also require the scraper's Playwright/Chromium installation.

| Check | Result |
| --- | --- |
| `npm --workspace app run build` | Passed |
| `npx tsc --noEmit -p app/tsconfig.app.json` | Passed |
| `npm --prefix backend run build` | Passed |
| `npm --prefix scraper run build` | Passed |
| `npm --workspace app test` | 8 passed |
| `npm --prefix backend test` | 56 passed; 6 database integration tests skipped |
| `npm --prefix scraper test` | 27 passed |
| `node app/tests/browser-smoke.mjs` | Passed, including four successive inertia/swipe/close cycles and the failed-device-lock boundary |
| Focused ESLint on the new interaction/refresh helpers and changed navigation, reader, lock, portfolio-cache and metric components | Passed |
| Production `npm audit --omit=dev` (app, backend, scraper) | No known vulnerabilities reported at audit time; not a security certification |
| `npm --workspace app run lint -- --quiet` | Fails: 282 errors, predominantly existing explicit `any` typing debt; not suppressed |
| `git diff --check` | Passed |

The browser harness intercepts all non-local requests, uses a synthetic account and portfolio, and blocks external network calls. No production account or database is modified. It verifies five bottom-navigation routes with single taps, full-screen article image/content scrolling through actual touch gestures, repeated article close taps, pull-to-refresh, holding edit/save, metric selection, light/dark selection contrast, portfolio sharing and stock back navigation. It checks that a failed **stubbed** device verification keeps private screens unmounted. Twenty-one route-mount checks cover populated fixture and empty/error states; a route rendering is not proof that every action on it works. Local screenshots go to ignored `.qa-artifacts/`.

Repeated browser runs reproduced a missing close click after inertial scrolling: touch-start/end and pointer-down/up reached the button but no compatibility click followed. This led to the touch-tap normalization above. The harness repeats swipe/close checks and retains touch-event diagnostics on failure. Physical iPhone/Safari/PWA scroll-and-tap behavior still requires device verification; do not infer an exhaustive fix from Chromium alone.

## Remaining verification and data limits

- Render deployment logs, live DB behavior/migrations, realtime multi-user chat, email/auth recovery, real biometrics, payments/subscriptions, notifications and sharing integrations were **not** end-to-end verified. Six database tests need a disposable configured test database. No live migration or data cleanup was run.
- No claim of full Simply Wall St/Moomoo feature parity or zero network latency. This pass improves the existing analysis engine and shared design; it does not implement a brokerage/trading engine.
- Scraper source pages were researched, but complete archive crawls, OCR output and source-specific field mappings were not validated against production. Existing KenyanStocks browser extraction remains review-gated. Financial-history publication requires period/currency/unit/entity validation in the existing review workflow. Source restrictions and redistribution rights still apply.
- More sources do not guarantee complete historical coverage or intraday candles. Missing verified series remain unavailable rather than fabricated. Portfolio transaction-aware performance requires a complete historical transaction/cash-flow ledger, beyond today's holdings.
- Restart/redeploy the scraper to register the newly added source IDs through `ensureDefaultSources`; existing source configurations are deliberately not overwritten. Allow scheduled archive discovery and review approved financial candidates before expecting new historical fundamentals in the UI.
- The existing additive P/S migration should still be applied through the normal deployment process; compatibility handling is not a substitute for keeping the schema current.

## Research references

- [X design and typography](https://blog.x.com/en_us/topics/company/2021/imperfect-by-design) — informs the compact sans direction, not a licence to redistribute Chirp.
- [Moomoo financial analysis support](https://www.moomoo.com/us/support/topic4_37) and [analysis manual](https://www.moomoo.com/au/manual/topic-14-173) — reference for financial-analysis presentation, not claims of equivalent data coverage.
- [Safaricom financial results](https://www.safaricom.co.ke/investor-relations-landing/reports/financial-report/financial-results), [KCB investor relations](https://kcbgroup.com/investor-relations/), [KCB financial statements](https://kcbgroup.com/financial-statements), [Equity results](https://equitygroupholdings.com/investor-relation/?cat=financial-results) — official archive seed pages.
