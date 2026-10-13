# Market Data Engine — pan-African, powered by Mansa API

Branch: `feature/mansa-market-data-engine`

## What this is

This is the "rest of Moomoo" — everything except order execution: live
quotes, daily charts, fundamentals, corporate actions, screener, movers,
and the existing AfriScore/ratios research engine — now sourced from
[Mansa API](https://mansaapi.com) instead of only the seeded NSE mock, and
spanning **seven African exchanges** instead of one.

## What changed, concretely

**One new adapter serves every exchange.** Unlike `adapters/nse/`, which
is hardcoded to Kenya because its data source (a seeded mock) only knows
Kenya, `adapters/mansa/` is generic — it takes an exchange code and works
for any exchange Mansa covers. So instead of writing an `NgxAdapter`, a
`JseAdapter`, a `GseAdapter`, etc. one at a time, there's one `MansaAdapter`
class, and registering a new market is a two-line change (see
`registry.ts`'s header comment).

```
backend/src/adapters/mansa/
  mansaRawTypes.ts   — Mansa's wire format (subset actually used)
  mansaClient.ts     — the ONLY file that knows mansaapi.com's URLs/auth
  mansaMapper.ts      — Mansa raw → Continua's standard schema
  mansaAdapter.ts     — implements IExchangeAdapter, parameterized by exchange
```

**`ACTIVE_EXCHANGES` grew from `["NSE"]` to `["NSE","NGX","GSE","JSE","LuSE","DSE","BRVM"]`**
(`config/index.ts`) — Nigeria, Ghana, Kenya, South Africa, Zambia,
Tanzania, and the BRVM regional exchange (Côte d'Ivoire and the rest of
West Africa's WAEMU zone). This matches Mansa Markets' full-coverage tier.
Because every existing route (`quotes`, `historical`, `companies`,
`financials`, `corporateActions`, `movers`, `sectors`, `research`,
`screener`, `instruments`) already takes `exchange` as a query param
validated against `ACTIVE_EXCHANGES`, **no new API routes were needed** —
the whole existing API surface became pan-African by wiring the adapter.

**Two adapter modes, controlled by `ADAPTER_MODE`** (`registry.ts`):
- `mock` (default, unchanged): only `NSE` is registered, on the existing
  synthetic client. Zero setup, exactly as before.
- `live`: every `ACTIVE_EXCHANGES` entry is registered against
  `MansaAdapter`. Requires `MANSA_API_KEY`.

## Indices — full ingestion vertical

Unlike everything else above (which became pan-African just by wiring the
adapter), indices needed a genuinely new slice through the whole stack,
because no "index" concept existed anywhere before this:

```
adapter.getIndices()                         [NseAdapter: synthetic composite from mock quotes
                                                MansaAdapter: real Mansa /indices endpoint]
  → indexCollector.collectIndices()           (retry wrapper)
  → normalizeIndex()                          (round, recompute change from value/previousClose)
  → IndexSchema.safeParse()                   (reject malformed records to dead-letters)
  → indicesRepository.upsertIndicesBatch()    (market.indices table)
  → cache invalidation                        (CacheKeys.indices(exchange))
  → ingestionLogRepository.log()              (audit trail, same as every other pipeline)
```

Driven by `workers/indexWorker.ts` (registered in `scheduler.ts`, runs
every `INDEX_POLL_INTERVAL_MS` — default 5 min, deliberately coarser than
price polling since an index is a derived composite, not something users
watch tick-by-tick, and Mansa's own index data doesn't refresh faster than
that anyway). Served via `GET /indices?exchange=...` →
`services/marketData/indexService.ts` → `hooks/useIndices.tsx` →
`pages/Markets.tsx`'s Indices card, which now shows real data for the
selected exchange instead of a hardcoded Kenya-only array, falling back to
the static Kenya demo data only when NSE is actually selected.

**Migration note**: `032_mansa_integration_followthrough.sql` also fixes a
real bug from the initial Mansa wiring — `cash_flow_statements
.operating_cash_flow` was `NOT NULL` in the schema, but
`financialsRepository.ts` was passing Mansa's (now-optional)
`operatingCashFlow` straight through without a null fallback, which would
have failed on insert for any Mansa-sourced security. Both the column
constraint and the repository call are fixed there.

## Setup
1. Get a free Mansa API key: `POST https://mansaapi.com/api/v1/keys` (see
   their docs) or via the dashboard — 100 requests/day, no credit card.
2. Set in `backend/.env`:
   ```
   ADAPTER_MODE=live
   MANSA_API_KEY=mansa_live_sk_...
   MANSA_API_BASE_URL=https://mansaapi.com   # default, only override if needed
   ```
3. Run migrations `030_market_schema.sql` (if not already applied) and
   `032_mansa_integration_followthrough.sql` (new indices table + the
   nullable cash-flow fix + the 6 new exchange rows) against your Postgres
   instance, in order.
4. Restart the backend. `startAllWorkers()` (updated to also start
   `indexWorker.ts`) will now ingest securities/quotes/candles/financials/
   corporate actions/indices across all seven exchanges instead of just NSE.

## Honest gaps — read this before wiring UI on top

Mansa's API is real and good, but it does not cover everything Moomoo's
own data does, and I did not fabricate data to paper over the difference.
Every gap below returns an empty result / `undefined` fields, not fake
numbers — see the comments at the top of `mansaAdapter.ts` and
`mansaMapper.ts` for exactly which fields:

| Feature | Status via Mansa |
|---|---|
| Live quotes | **~30-minute freshness**, not tick-level. Mapped as `source: "delayed"`, not `"live"` — don't relabel this in the UI. |
| Daily charts | ✅ Full daily OHLCV, deep history (JSE back to 1980, Kenya to 1992, etc). |
| Intraday charts | ❌ Not available. `getCandles()` returns `[]` for any interval other than `"1d"`. |
| Fundamentals | ✅ Revenue, profit, EPS, DPS, key ratios (P/E, ROE, dividend yield). ❌ No cash flow statement at all, no COGS/opex breakdown. |
| Dividends | ✅ **NGX only.** Other exchanges: `[]`. |
| Splits/bonus/rights issues | ❌ Not exposed by Mansa for any exchange. |
| Earnings calendar (estimates/actuals) | ❌ No such endpoint. Always `[]`. |
| Ownership/shareholder breakdown | ❌ No such endpoint. Always `[]`. |
| Screener, movers, indices, forex, commodities | ✅ Full support, pan-African. Indices now wired end-to-end (see below). |
| Company profile (HQ, CEO, founded year, website) | ❌ Not in Mansa's stock/fundamentals payloads. `Company` fields left `undefined`. |

The `CashFlowStatement.operatingCashFlow` field in
`backend/src/types/market.js` was changed from required to **optional**
to reflect this honestly — a screener or ratio calculation that used to
assume it always exists must now treat `undefined` as "not available",
not "zero" (this was already fixed in `normalizeFinancials.ts` as part of
this change).

## Not built yet

- ~~**Frontend exchange selection.**~~ **Done** — see
  `hooks/useExchange.tsx` (global, localStorage-persisted selection),
  `lib/exchanges.ts` (the 7-exchange metadata list), and
  `components/shared/ExchangeSelector.tsx` (the 🇰🇪 NSE ▾ picker, wired
  into `TopBar` on Home and Markets). `useInstruments`, `useMovers`, and
  `useLiveQuotes` now read the selected exchange by default instead of
  hardcoding `"NSE"`.

  **Still genuinely Kenya-only**, not touched by this pass, and flagged
  rather than silently left broken:
  - `pages/Markets.tsx`'s commodities (KES tea/coffee prices), IPO
    calendar, and dividend calendar tabs are still hardcoded static Kenya
    data. Indices are no longer in this list — see below, they're now
    live end-to-end. Commodities/IPOs/dividend-calendar would need either
    Mansa's `/forex`, `/commodities` endpoints (commodities) or per-country
    static datasets (IPO/dividend calendars, which Mansa doesn't provide
    at all) — real content/data work, not a wiring change.
  - `lib/stockPrices.ts` (`CANONICAL_SYMBOLS`, `STOCK_META`) — the static
    fallback dataset used when the API is unreachable is Kenya-only.
    `useInstruments` now only falls back to it when the selected exchange
    is actually `"NSE"`; other exchanges correctly show empty rather than
    mislabeled Kenyan tickers.
  - `components/stock/tabs/PerformanceTab.tsx`'s "vs NSE" benchmark
    toggle — backed by `data/stockFundamentals.ts`'s fixed NSE-20 return
    data. Deliberately left as-is rather than relabeled: changing the
    displayed word to match the selected exchange without also having
    real per-exchange benchmark returns underneath would misrepresent the
    number, not fix it.
- **Real-time push.** `subscribeQuotes()` polls (floored at 60s) rather
  than streaming, because Mansa has no WebSocket feed — and polling faster
  than Mansa's own ~30-minute server-side refresh just burns request quota
  for an identical value.
- **Non-NGX corporate actions / earnings / ownership** — genuinely
  unavailable from Mansa today; would need either a second data source
  layered in per-exchange, or Mansa expanding coverage.