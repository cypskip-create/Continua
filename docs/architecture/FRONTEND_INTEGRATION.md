# Frontend ↔ Continua Data Layer Integration

Status as of this integration pass. This is the connection between `app/`
(the React frontend) and `backend/` (the Continua Data Layer) described
in `docs/architecture/ARCHITECTURE.md` and `docs/api/API.md`.

## What changed

### Backend (`backend/`)
One missing endpoint was added — everything else the frontend needed
already existed:

- **`GET /api/v1/instruments?exchange=NSE`** — lists the full tradable
  universe for an exchange (`storage/repositories/securitiesRepository.ts`
  → `listInstruments`, `api/controllers/instruments.controller.ts`,
  `api/routes/instruments.routes.ts`). This exists so the frontend can ask
  the Data Layer "what stocks do you actually have data for" instead of
  relying on a hand-maintained ticker list that drifts out of sync (see
  "Known gap" below — this is exactly the problem it solves).

No other backend files were changed. All 45 existing backend tests still
pass, including the full integration pipeline test against a real Postgres
database.

### Frontend (`app/src/api/`, new)
A clean client layer, matching the structure `docs/architecture/DATA_FLOW.md`
already called for:

| File | Purpose |
|---|---|
| `client.ts` | Base fetch wrapper — API key header, base URL, typed `ContinuaApiError` |
| `types.ts` | TS types mirroring the backend's standard schema (`backend/src/types/market.ts`) |
| `quotesApi.ts`, `historicalApi.ts`, `companiesApi.ts`, `financialsApi.ts`, `corporateActionsApi.ts`, `moversApi.ts`, `sectorsApi.ts`, `researchApi.ts`, `screenerApi.ts`, `instrumentsApi.ts` | One thin module per backend resource |
| `websocketClient.ts` | Single shared WebSocket connection with per-symbol ref-counted subscriptions — N components watching SCOM share one server subscription, matching `docs/architecture/DATA_FLOW.md`'s "shared real-time data layer" |

### Frontend hooks (`app/src/hooks/`, new)
- `useLiveQuotes` / `useLiveQuote` — the core hook: React Query for the REST
  snapshot + the shared WebSocket for live ticks. Everything else builds on
  this.
- `useLivePortfolioQuotes` — shapes a set of holdings' live quotes for
  `computePortfolioStats` (see below); used by every page showing
  portfolio-level totals.
- `useInstruments` — real tradable universe, static fallback if the API is
  unreachable.
- `useMovers`, `useResearch`, `useCompanyProfile` — thin wrappers over their
  respective endpoints.
- `useHistoricalCandles` — real daily candle history mapped to the price
  chart's internal point shape.
- `useDividendHistory`, `useOwnership` — real per-symbol dividend and
  ownership history for StockDetail's research tabs.
- `useAfriScreener` — one batched `/screener` call (marketCap/PE/dividend
  yield/AfriScore) combined with live quotes, for the Screener page.

`lib/stockPrices.ts`'s `computePortfolioStats(portfolio, liveQuotes?)` also
gained an optional second parameter — pass a `useLivePortfolioQuotes` result
and portfolio totals price off live quotes; omit it and behavior is
unchanged (fully static, as before).

### Frontend hooks/pages rewired to use them
- **`useRealtimePrices` / `useRealtimePrice`** — previously a client-side
  random-walk simulation (its own comment said "replace with actual
  WebSocket/API"). Now backed by the real Data Layer. Same external
  interface, so its one consumer (`RealtimeWatchlistWidget`) needed no
  changes.
- **`Watchlist.tsx`** — live prices via `useLiveQuotes`; "add to watchlist"
  search now lists the real instrument universe via `useInstruments`.
- **`AllStocksList.tsx`** (Markets → All Stocks tab) — live quotes overlaid
  on the static reference list.
- **`Markets.tsx`** — Top Gainers/Losers now come from `GET /movers`
  (server-computed, not re-derived client-side); sector rollups overlay live
  quotes onto the static universe.
- **`StockDetail.tsx`** — quote header (price/change/volume/market cap) is
  live; company description/HQ/CEO/employees/founded come from
  `GET /companies/:symbol` when available; the AfriScore card prefers the
  Data Layer's own calculation (`GET /research/:symbol`) over the client's
  heuristic estimate.
- **`HoldingsList.tsx`** (Portfolio, used by both `TrackInvestments.tsx` and
  the public `UserProfile.tsx`) — position values, day change, and dividend
  income all price off live quotes, so a holding's value can't disagree with
  what Watchlist/Markets/the Stock Page show for the same symbol (the
  "single source of truth" requirement in `docs/architecture/ARCHITECTURE.md`).
- **`StockScreener.tsx`** — marketCap/P/E/dividend-yield/AfriScore/price/
  change are all live via `useAfriScreener` (one batched `/screener` call +
  live quotes). The rest of the filtering UI (RSI, volume buckets,
  market-cap ranges, sliders) stays client-side — the backend's `/screener`
  endpoint doesn't carry RSI or volume, and a full swap to server-side
  filtering would drop working UI features rather than add value.
- **`StockDetail.tsx` price chart & research tabs** — see the "Still on
  static/mock data" section below for exactly which parts of StockDetail
  are live vs. not; it's the one page split across both lists since it has
  a lot of surface area.
- **`StockCompare.tsx`** — live quotes overlay the comparison table; the
  page now holds selected *symbols* rather than snapshotted stock objects,
  so an open comparison keeps updating instead of freezing prices at the
  moment a stock was added.
- **`SectorDetail.tsx`**, **`SectorHeatmap.tsx`**, **`ThemeDetail.tsx`**,
  **`FeaturedListDetail.tsx`** — live quotes overlaid on their respective
  static symbol lists, same pattern as `AllStocksList`.
- **`Discover.tsx`** — trending-stocks ticker, portfolio summary card, and
  the embedded `StockHeatmap` all live.
- **`Home.tsx`** — portfolio summary card and watchlist-movers section live;
  its `CommandCenterSections` and `QuickTradeWidget` children also overlay
  live prices (see the caveat on `CommandCenterSections`'s synthetic
  "upside %" below).
- **`TrackInvestments.tsx`** and **`UserProfile.tsx`** — portfolio summary
  totals (value, gain, day change) now use the same
  `computePortfolioStats(portfolio, liveQuotes)` overlay as `HoldingsList`
  itself, closing a real inconsistency: previously the holding *rows*
  (via `HoldingsList`) were already live, but the *summary numbers above
  them* were still computed from static prices — the two could disagree.

### Fallback behavior (by design, not an oversight)
Every hook above degrades gracefully instead of erroring or fabricating
data:
- A symbol outside the Data Layer's current universe → falls back to the
  existing static reference price/metadata for that one symbol, with an
  `isLive`/`source` flag threaded through so it's not silently presented as
  live.
- API unreachable entirely → `useInstruments` falls back to the static
  ticker list; other hooks return empty/loading state rather than fake data.

## Known gap: symbol universe mismatch

The backend's mock NSE adapter (`backend/src/adapters/nse/nseClient.ts`)
currently generates data for **17 real NSE tickers**. The frontend's static
reference list (`app/src/lib/stockPrices.ts`) has **~30**. The extra ~13
(e.g. `ARM`, `NBK`, `UMEME`, `CIC`, `KENO`, `WTK`, `KAKZ`, `SASN`, `EGAD`,
`TCL`, `SAMR`, `NSE`, `CARBACID`) aren't in the Data Layer yet, so they keep
showing static reference prices everywhere, flagged internally as
non-live. This wasn't "fixed" by fabricating quotes for them — per the
brief's §26, that would mean inventing financial information. The clean fix
is either narrowing the frontend's list to match the real backend universe,
or adding the remaining companies to the NSE adapter/seed data; both are
mechanical once the real data source (or a wider mock seed) is decided.

## Still on static/mock data (not yet wired this pass)

- **`StockScreener.tsx`** — marketCap/P/E/dividend-yield/AfriScore/price/
  change are all live (via `useAfriScreener.tsx`, one batched `/screener`
  call). The actual filtering UI (sector, price/PE sliders, RSI, volume
  buckets, market-cap ranges) still runs client-side rather than delegating
  to `/screener`'s server-side filters — the backend's filter set is
  coarser than the UI's (no RSI, no volume, no price range), so a full
  swap would drop working UI features rather than add value.
- **`StockDetail.tsx` price chart** — real daily candles from
  `GET /historical/:symbol` for every timeframe except "1D" (the backend
  only backfills daily bars — see `useHistoricalCandles.tsx` — so a 1-day
  chart stays on the generated series until the Data Layer has an intraday
  candle source). `StockPriceChart` takes an optional `data` prop for this;
  omit it and the component still works standalone off its own mock
  generator, unchanged.
- **`StockDetail.tsx` research tabs** — the AfriScore card and Valuation/
  Growth/Health/Dividends/Ownership/Risk/Performance tabs all read one
  shared `fundamentals` object (`Fundamentals` type,
  `app/src/data/stockFundamentals.ts`). Rather than rewrite each tab, a
  `liveFundamentals` overlay in `StockDetail.tsx` merges real data onto
  specific fields of that same object: `dividendHistory` (from
  `useDividendHistory.tsx` → `/dividends/:symbol`, interim+final payouts
  summed per year), `payoutRatio` (from `/research/:symbol`), `ownership` /
  `topShareholders` (from `useOwnership.tsx` → `/ownership/:symbol`).
  Fields the backend has no data source for yet — analyst price targets,
  insider trades, revenue segments/geographic split, Piotroski F-Score,
  Altman Z-Score, EPS-estimate drift, earnings surprises, full multi-year
  ROE/ROA/ROIC and margin *history* (the backend's `/research/:symbol`
  gives current ratios, not a time series) — are deliberately left on the
  synthetic generator rather than fabricated. `docs/architecture/ARCHITECTURE.md`
  names Piotroski/Altman Z as part of the intended RESEARCH surface, so
  those two are the most natural next backend additions if this gets
  picked up further.
- **`CommandCenterSections.tsx`**'s "Undervalued Picks" and "High-Growth
  Stocks" sections — current price is live where available, but the
  *ranking itself* (upside vs. an analyst target, revenue CAGR) is computed
  against synthetic target/growth numbers, since the backend has no analyst-
  target or multi-year-growth data source. Real current price against a
  fake target is still an improvement over an entirely fake price+target,
  but the "upside %" itself isn't a real number — flagged here so it isn't
  mistaken for one.
- Indices (NSE 20/25, NASI), commodities, IPO/economic-calendar entries in
  `Markets.tsx` — the Data Layer doesn't have index/commodity/calendar data
  sources built yet; these remain illustrative placeholders until that's
  added upstream, not something the frontend integration layer can fix on
  its own.

Every other page/component that reads stock prices — `Watchlist`,
`Markets`, `AllStocksList`, `StockDetail`'s quote header, `HoldingsList`
(Portfolio, Track Investments, public profiles), `StockScreener`'s
price/change/marketCap/PE/dividend/AfriScore columns, `StockCompare`,
`SectorDetail`, `SectorHeatmap`, `ThemeDetail`, `FeaturedListDetail`,
`Discover` (trending stocks + portfolio summary + heatmap),
`Home` (portfolio summary + watchlist movers + Command Center + Quick
Trade), and `UserProfile`'s public portfolio summary — is now backed by
live Continua Data Layer quotes, with the existing static reference
data as a graceful per-symbol fallback.

None of the above were silently left as mock — they're listed here
precisely so the gap is visible rather than assumed away.

## Verified this pass

- Stood up a real local Postgres 16, applied `supabase/migrations/030_market_schema.sql`
  and `031_production_readiness.sql` cleanly.
- **45/45 backend tests pass**, including the full pipeline integration test
  against that real database.
- Booted the full backend (REST API :4000, WebSocket :4001, ingestion/
  calculation workers) and exercised it directly: `/health`, auth
  enforcement, `/quotes`, `/movers`, `/research`, `/screener`, `/financials`,
  `/sectors`, `/dividends`, `/ownership`, `/historical`, the added
  `/instruments`, and a 404 for an unknown symbol.
- Caught and fixed a real unit bug: the ratios engine's `dividendYield` and
  `payoutRatio` are raw fractions (`0.0493`), not percentages — StockDetail
  was displaying them un-multiplied.
- Frontend: clean `tsc --noEmit` against `tsconfig.app.json` and clean
  production `vite build` after every round of changes. ESLint scoped to
  every file actually touched shows zero *new* errors — verified by
  `git stash`-ing each round's diff and confirming the same `any`-type
  errors exist at the same lines beforehand; the wider repo (files never
  touched by this integration) carries ~100 pre-existing lint errors/warnings
  of its own, unrelated to this work.
- Headless-browser (Playwright) runs against the live dev server + live
  backend across every round, confirming the actual network calls fire and
  return `200`: `GET /instruments`, `GET /movers`, `GET /quotes` (batch, all
  30 canonical symbols), `GET /companies/SCOM`, `GET /research/SCOM`,
  `GET /dividends/SCOM`, `GET /ownership/SCOM`, `GET /historical/SCOM`
  (on switching the chart's "1Y" pill), and `GET /screener` (Screener page).
- (Those Playwright runs temporarily bypassed the Supabase auth guard
  in-memory to reach routes without a login flow; the real
  `ProtectedRoute.tsx` was restored immediately after each one and is
  unchanged in the final diff — confirmed via `git status`.)

## Environment variables (new)

Added to `app/.env`:

```
VITE_AFRIFINANCE_API_URL="http://localhost:4000/api/v1"
VITE_AFRIFINANCE_WS_URL="ws://localhost:4001"
VITE_AFRIFINANCE_API_KEY="dev-local-only-key"   # matches backend's DEV_API_KEY
```

**Production note:** `VITE_AFRIFINANCE_API_KEY` is a first-party key for
Continua's own backend (not an upstream NSE credential), but Vite still
ships it in browser JS. Fine for local dev; before shipping to real users,
replace `getApiKey()` in `app/src/api/client.ts` (and the matching spot in
`websocketClient.ts`) with a short-lived token fetched from an authenticated
endpoint — e.g. a Supabase Edge Function that holds the real key
server-side and mints a scoped, per-user, expiring token. Nothing else
needs to change.

## Running it locally

```bash
# 1. Database (once)
createdb continua
psql -d continua -f supabase/migrations/030_market_schema.sql
psql -d continua -f supabase/migrations/031_production_readiness.sql

# 2. Backend
cd backend
cp .env.example .env   # set DATABASE_URL, DEV_API_KEY, etc. — see backend/README.md
npm install
npm run dev             # API on :4000, WS on :4001

# 3. Frontend
cd app
npm install
npm run dev              # picks up VITE_AFRIFINANCE_* from app/.env
```