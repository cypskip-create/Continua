# Technical Engine — indicators, backtester, volume profile, valuation, alerts

Branch: `feature/mansa-market-data-engine`

## What this is

Mapped against the real Moomoo Engine (see
https://www.moomoo.com/us/learn/detail-what-is-moomoo-engine-118320-260799026):
the non-execution pieces of its **Technical Engine** and one piece of its
**Fundamental Engine**, built on top of the pan-African market data already
wired via Mansa. Everything here is computed from real ingested data —
nothing is a canned demo or a fabricated number.

**Deliberately out of scope**, per earlier conversation: the whole
**Options Engine** (derivatives strategy tools) and the execution-oriented
parts of the Technical Engine (Instant Order Ladder, Pro Chart Trading,
Advanced Order Types) — those require actual trading infrastructure. Also
out of scope because Mansa's data doesn't support them: Wall Street analyst
forecasts, institutional research reports, revenue-by-segment breakdown,
and institutional/insider ownership tracking (all Fundamental Engine
pieces — see `MARKET_DATA_ENGINE.md`'s gaps table for why).

## What's new

```
backend/src/services/technical/
  indicators.ts          — pure SMA/EMA/RSI(Wilder)/MACD/crossover math
  indicatorsService.ts    — fetches candles, computes one indicator series
  backtestService.ts      — real day-by-day strategy simulation
  volumeProfileService.ts — buckets historical volume by price level
  valuationService.ts     — 3 valuation models from real stored data
```
Each has an API surface: `GET /indicators/:symbol`, `POST /backtest`,
`GET /volume-profile/:symbol`, `GET /valuation/:symbol`. Frontend wrappers:
`api/{indicators,backtest,volumeProfile,valuation}Api.ts` and matching
hooks (`useIndicator`, `useBacktest`, `useVolumeProfile`, `useValuation`).

**No UI screens wired yet** — this pass is the engine + typed API access,
same proportion as the indices work before it. `useBacktest` is a mutation
(user picks a strategy, hits "Run"), the other three are queries.

### Indicators (`/indicators/:symbol`)
SMA, EMA, Wilder's RSI (the standard formulation, same as most charting
platforms), MACD. Computed from whatever candle history is in
`market.candles` — daily-only today, since no adapter provides intraday
bars (Mansa's `/history` is daily-only). A period with insufficient
history returns `null` for that point rather than a partial-period
average pretending to be a full one.

### Backtester (`/backtest`, POST)
Three strategies: `sma_cross`, `ema_cross` (trend-following), `rsi_reversion`
(mean-reversion). Walks the historical candle series bar-by-bar with no
look-ahead — a signal computed through day N can only fill at day N's
close. Long-only, one position at a time. **Explicitly does not model**
transaction costs, spread, slippage, or dividends — the response's
`caveat` field says so, and any UI built on this must surface that
caveat, not just the return numbers. An open position at the end of the
tested range is not force-closed into a phantom trade.

### Volume Profile (`/volume-profile/:symbol`)
Buckets volume by price level over a date range; returns point-of-control
(highest-volume price) and the 70%-of-volume "value area" around it.
**Honest limitation**: a real volume profile needs intraday data; this
distributes each day's volume evenly across that day's own high-low
range, which is a genuine approximation, not the real thing — useful
directionally over weeks/months, not a substitute for an intraday profile
on a single day. Documented in the response's `caveat` field too.

### Valuation models (`/valuation/:symbol`)
Three independent models, each computed from data actually on file:
- **Relative Valuation (Sector P/E)** — sector average P/E (excluding the
  security itself and loss-making peers) × this security's trailing EPS.
  Needs ≥3 profitable sector peers with computed ratios or it returns
  `unavailableReason` instead of a number.
- **Graham Number** — Benjamin Graham's √(22.5 × EPS × Book Value/Share).
  Needs positive EPS and book value per share on file.
- **Dividend Discount Model** — single-stage Gordon Growth, using a
  measured trailing dividend growth rate (clamped to a sane range) against
  an assumed 12% required return. Needs ≥4 recorded dividend payments.

Every model that can't compute returns `fairValue: null` with a stated
`unavailableReason` — never a guessed number. The whole response carries
a `caveat` explaining these are illustrative starting points, not price
targets.

### Indicator-based alerts
Extends the existing `price_alerts` table/`check-price-alerts` function
(previously price-only, Kenya-only — hardcoded "KES" in every
notification message, no `exchange` column at all):
- Migration `033_alerts_multi_exchange_and_indicators.sql` adds
  `exchange`, `currency`, `indicator`, `indicator_params` columns.
- `check-price-alerts/index.ts` fixed: uses the alert's own `currency`
  instead of hardcoded KES, filters by `exchange`, and now excludes
  indicator alerts (`indicator IS NULL`) since those need a different
  evaluation path.
- New `check-indicator-alerts/index.ts`: evaluates `RSI`, `SMA_CROSS`,
  `EMA_CROSS` alerts by calling the backend's `/indicators/:symbol`
  endpoint (via new `CONTINUA_DATA_BASE_URL` / `CONTINUA_DATA_API_KEY`
  Edge Function secrets — set these to your deployed backend's URL and an
  API key from `backend/scripts/generateApiKey.js`).
- `hooks/usePriceAlerts.tsx` extended with the new fields.

**Not done**: no UI to actually create an indicator alert yet (the hook
supports it; there's no form). No scheduled/cron invocation of either
check function — both are still designed to be called by the client
after it already has a quote/is viewing a symbol, same as before this
change. A production deployment wanting alerts to fire even while no
user has the app open would need a cron-triggered sweep instead.

## Setup
Run migration `033_alerts_multi_exchange_and_indicators.sql`. Set Edge
Function secrets `CONTINUA_DATA_BASE_URL` (your deployed backend's public
URL) and `CONTINUA_DATA_API_KEY` (generate one with
`backend/scripts/generateApiKey.js`) for `check-indicator-alerts` to work.
Deploy `check-indicator-alerts`; redeploy `check-price-alerts` (its body
changed). No new backend env vars — `/indicators`, `/backtest`,
`/volume-profile`, `/valuation` all ride on the existing `ADAPTER_MODE`/
`MANSA_API_KEY` setup from `MARKET_DATA_ENGINE.md`.