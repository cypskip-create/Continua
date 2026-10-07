# Engine workspace and news freshness

Engine is divided into Company, Analysis and My workspace. Tool selection is
URL-backed, so Home shortcuts, reloads and browser navigation open the intended
tool. Existing account preferences, paid access, technical tools and portfolio
calculations are preserved. Journal/checklist notes are account/exchange/stock
scoped in device storage, not cloud-synced and never used as financial inputs.

Portfolio updates, stock headlines and the Engine digest link by stable news ID
to `/traders-hub?tab=media&article=...`. Media resolves the detail endpoint even
when an article is absent from the recent feed or the current category.

## Ten-minute news cycle

- `NEWS_CRAWL_CRON` defaults to `*/10 * * * *` and overrides legacy RSS cron
  values, including sources that previously fell back to six-hour crawling.
  Non-RSS filings/issuer schedules are unchanged.
- Feed discovery sorts newest dated stories before applying batch limits.
- In-flight runs are skipped to prevent overlapping crawls of a slow publisher.
- Backend bridging runs every two minutes by default; app news queries check
  every minute while active and on reconnection/focus. Publication timestamps
  remain the publisher's dates, not the poll time.
- `/news/status` exposes actual scheduled RSS starts/completions, counts and
  failures. A robots-blocked or empty feed is not reported as a successful check.
- Disabled sources remain disabled and robots/publisher restrictions are honored.

Deploy both scraper and app for these changes to take effect. **The repository's
Render Blueprint still selects free web services. An in-process timer cannot run
when a host suspends its process.** Continuous unattended freshness therefore
requires an always-running service or a durable external job configuration; this
change does not purchase hosting or claim to solve sleeping infrastructure.
An opt-in `render.always-on.yaml` has been prepared for both services with
`0.5c-512mb` compute (formerly Starter), one instance each. The active
`render.yaml` remains on free compute to avoid an unapproved bill. Before applying
the alternative, verify the current prices and existing service names/regions in
Render's dashboard and preserve all existing secrets and optional Engine settings.
See https://render.com/docs/compute-plans and https://render.com/docs/free.
No additional Render database is needed: both services continue using Supabase.
The initial always-on tier removes idle suspension but is not a guarantee that
512 MB is enough for concurrent PDF/OCR work; monitor memory/restarts and increase
resources only with explicit billing approval if needed.
After deployment, inspect `/news/status` across at least two ten-minute ticks and
compare the newest `market.news_items.published_at` with accessible publisher feeds.

For further Engine development, prioritize source-period alignment, provenance,
licensed analyst/ownership inputs and notification delivery monitoring rather than
inventing values for missing coverage. Evidence quality, change tracking, scenario
comparison and monitoring are now easier to discover from the workspace.
