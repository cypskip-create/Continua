# Continua interaction, data and social follow-up

## Implemented

- Flat page surfaces replace decorative cards across shared components and explicit legacy containers. Buttons, input controls, media frames, dialogs and analytical chart colouring remain functional. Portfolio metric selection displays the selected company's actual formatted metric inside its bubble.
- Refresh tasks run independently with bounded waits and section-specific failure reporting. Shared price alerts and notifications now participate in the query cache/refresh flow. No successful dataset is cleared because a different request failed.
- Bottom navigation remembers tab URLs; Markets/Portfolio selections and Media categories survive navigation. Saved page offsets are restored without smooth scrolling.
- Font size updates the root rem scale; fixed pixel text utilities have been converted to rem. Light mode remains pure white.
- Markets puts dated index observations first, followed by breadth, rankings, screener/heatmap/calendar/alert shortcuts and existing discovery tools. Coverage is disclosed; volume is not mislabelled as actual turnover.
- Official NSE homepage extraction handles NASI, NSE 20 and NSE 25, plus NSE 10 if that source publishes it. Point changes are converted to percentages correctly. Synthetic index fallbacks were removed, including older secondary widgets. Closing observations ingest outside trading hours too.
- NSE fundamentals ingestion preserves every available reporting period instead of dropping all but the newest. Ratios are recomputed once after all periods for a security are stored. Existing price-history backfill and review-gated issuer filing extraction remain in place.
- Research database reads run concurrently; same-security/price recomputations share an in-flight job, and results populate the API cache. This reduces redundant work but does not eliminate hosting cold starts or create missing source data.
- Community sentiment uses scoped phrases, emoji, negation checks and per-post weighting, rather than counting overlapping keywords in only six displayed posts. It is an explainable language heuristic, not investment advice or comprehensive language understanding.
- Notifications have a Mentions filter and a separate Alerts management/activity section. Failed inbox writes no longer appear successful. New alerts are visible to the app-wide watcher without restarting.
- Fixed scheduled alert quote parsing (`{ data: quotes }`, not a raw array). Quick checks use server-fetched prices, not phone-supplied values. All three alert delivery paths use an atomic database transaction to prevent duplicate delivery and partial notification writes.
- Expanded shared post/comment emoji reactions. The empty control uses an emoji rather than a like icon. Failed post-detail reactions/bookmarks roll back; fabricated post view counts were removed.
- Post composer is exempt from bottom-sheet motion and centres within the visual viewport, including keyboard resize events. News and other sheets still open upward. Confirmations are compact bottom snackbars.
- Up to five image uploads, inline image grids and full-image navigation. New images live in an owner-scoped storage bucket rather than inflating post rows with base64 data. Failed publishing removes its uploaded files and preserves the draft.
- Inline single-answer polls: 2–4 distinct options, selectable duration, server-enforced closing time, immutable published options, one vote per authenticated user and aggregate results without exposing voter identities.
- Home and Media share one news request/cache instead of a request per holding. A failed refresh displays a retry state and retained public stories (up to 24 hours); it is not presented as a genuinely empty feed. Successful empty results remain authoritative.

## Verification

- Frontend TypeScript check and production build pass.
- Backend and scraper TypeScript builds pass.
- App: 12 unit checks pass, including executing isolated alert handlers with mocked Supabase/backend responses, forged-price rejection, refresh partial failure, sentiment and metric layout.
- Backend: 62 checks pass; 6 database integration checks remain skipped without a test database.
- Scraper: 31 checks pass, including published-index date/level/sign parsing and invalid-date rejection.
- Isolated Chromium mobile harness passes: all five bottom-tab single taps; navigation drag/keyboard behaviour; four real article swipes and one-tap closes; pull refresh; holding save; metric selection; light/dark contrast; Media return; saved Markets offset; flat surfaces; persistent font scaling; centred composer in a 390×430 keyboard-sized viewport; five fixture uploads; inline poll voting; saved news during an injected 503; 21 route mounts; stock back; failed device verification.
- Browser traffic is intercepted: no tests post, vote, edit holdings or upload to production. This is not physical iPhone keyboard testing, live Render diagnostics, an exhaustive audit of every feature, or proof that every NSE company's historical dataset is complete.

## Required deployment order

Apply these new Supabase migrations before enabling the new gallery/poll and alert functions:

1. `20261004120000_more_community_reactions.sql`
2. `20261004123000_atomic_alert_delivery.sql`
3. `20261004130000_post_gallery_and_polls.sql`

Then deploy `check-price-alerts`, `check-indicator-alerts`, and `run-price-alerts`. The existing server-only `CONTINUA_DATA_BASE_URL`, `CONTINUA_DATA_API_KEY`, `ALERTS_CRON_SECRET` and the existing alert cron schedule must be configured. Do not expose service-role/API secrets in the frontend. Migrations and Edge Functions were not applied to production from this task; SQL transaction/RLS behaviour still requires staging integration validation.

Deploy backend and scraper together. `ensureDefaultSources` registers `nse-index-summary`; the crawler must successfully fetch/extract it before the index worker can publish levels. Existing scraped/approved financials and enabled historical providers determine actual historical coverage. Missing information is not replaced with invented numbers. NSE 10/other licensed index coverage is not promised without a verified source observation. No live Render deployment or crawl completion is claimed.

## Research and boundaries

- [Moomoo Markets guide](https://www.moomoo.com/us/learn/what-is-the-markets-tab): adapted its data-first overview, rankings and analytical-tool grouping to Continua's supported data. This is not a complete Moomoo clone: options/order-book/order-flow/global-asset tools need separate verified, licensed feeds; trading remains out of scope.
- [Official NSE market summary](https://www.nse.co.ke/): verified the `stat_date`, `stat_head`, `stat_figures` markup and dated NASI/NSE20/NSE25 observations. No observed level is hardcoded into production UI.
- News publishing rights and filing review gates remain necessary. Source availability, robots policies, publisher changes, network failures and hosting cold starts can still affect freshness. Saved content is not labelled live.
