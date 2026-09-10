# API Reference

Base URL: `http://localhost:4000/api/v1` (configure `PORT` in `.env`).
All responses are JSON, wrapped as `{ "data": ... }` on success or
`{ "error": "message" }` on failure (see status codes per endpoint).

## Authentication

Every endpoint below requires an API key, **except `/health`**. Supply it as
either:
```
Authorization: Bearer <key>
X-API-Key: <key>
```
Get a key via `npm run apikey:create -- "Name"` (see the backend README).
Missing/invalid keys get `401`. Requests are also rate-limited per key
(`429` when exceeded) — see `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_DEFAULT`
in `.env`, or a key's own `rate_limit_per_min` if it was issued with a
custom tier.

Every endpoint also accepts an optional `?exchange=NSE` query param
(defaults to `NSE`) — this is what makes the same API surface work for
every future exchange without new routes. All query params are validated;
an invalid or out-of-range value returns `400` with a specific reason
rather than an ad-hoc error.

## Health

### `GET /health`
Returns database + cache connectivity status. `200` if healthy/degraded,
`503` if unhealthy.
```json
{ "status": "healthy", "checks": { "database": { "ok": true }, "cache": { "ok": true } }, "timestamp": "..." }
```

## Quotes

### `GET /quotes/:symbol`
Latest quote for one symbol. `404` if unknown.

### `GET /quotes?symbols=SCOM,EQTY,KCB`
Batch quotes. `symbols` is required, comma-separated.

## Historical

### `GET /historical/:symbol?interval=1d&from=<iso>&to=<iso>`
OHLCV candles. `interval` ∈ `1m,5m,15m,1h,1d,1w,1M,1y` (default `1d`).
`from`/`to` default to a 90-day trailing window.

### `GET /historical/:symbol/performance?from=<iso>&to=<iso>`
Range performance (start price, end price, % change) between two dates.
`from` is required.

## Companies

### `GET /companies/:symbol`
Company profile: name, description, HQ, CEO, employees, founded, sector,
website. `404` if unknown.

## Financials

### `GET /financials/:symbol?periodType=annual`
Latest financial period (income statement + balance sheet + cash flow
merged into one object). `periodType` ∈ `annual,quarterly` (default
`annual`). `404` if no financials ingested yet.

### `GET /financials/:symbol/history?periodType=annual&limit=5`
Historical periods (revenue, net income, EPS), oldest → newest.

## Corporate actions

### `GET /corporate-actions/:symbol`
All corporate actions for a security, newest first.

### `GET /dividends/:symbol`
Dividend-type corporate actions only, ordered by ex-date.

### `GET /ownership/:symbol`
Holder breakdown (institution/insider/government/public), by % held.

## Market movers

### `GET /movers?limit=10`
Top gainers and losers by `change_percent` on the exchange.
```json
{ "data": { "gainers": [ ...Quote ], "losers": [ ...Quote ] } }
```

## Sectors

### `GET /sectors`
All canonical sectors. Cached 5 minutes.

## Research

### `GET /research/:symbol`
Computed ratios + AfriScore for a security. Computes on-demand (and caches)
if not already stored — but in normal operation this is pre-computed for
the whole universe at bootstrap and after each fundamentals sync (see
`docs/architecture/DATA_FLOW.md`).
```json
{
  "data": {
    "ratios": { "pe": 18.14, "pb": 2.24, "roe": 0.123, "dividendYield": 0.0225, "...": "..." },
    "score": { "afriScore": 59, "afriValue": 56.3, "afriGrowth": 50, "afriHealth": 64.2,
               "afriIncome": 53, "afriRisk": 91.1, "afriQuality": 37.5, "afriMomentum": 28.5,
               "inputs": { "pe": 18.14, "...": "..." } }
  }
}
```

## Screener

### `GET /screener?sector=Banking&maxPe=15&minDividendYield=0.03&minAfriScore=60&sortBy=afriScore&sortDirection=desc&limit=50`
All filters optional. `sortBy` ∈ `afriScore,changePercent,marketCap,dividendYield,pe`
(default `afriScore`). `limit` capped at 200.

## WebSocket streaming

Connect to `ws://localhost:4001?apiKey=<key>` (configure `WS_PORT`). The key
is checked at connection time (`verifyClient`) — an invalid/missing key
gets the connection rejected with a 401 before the upgrade completes.

**Subscribe:**
```json
{ "action": "subscribe", "symbols": ["SCOM", "EQTY"] }
```
**Unsubscribe:**
```json
{ "action": "unsubscribe", "symbols": ["EQTY"] }
```
**Received events:**
```json
{ "type": "quote", "payload": { "symbol": "SCOM", "lastPrice": 12.91, "...": "..." } }
{ "type": "corporate_action", "payload": { "securityId": "NSE:KCB", "type": "dividend", "...": "..." } }
```
A client with no active subscriptions receives nothing — subscribe to at
least one symbol to start receiving quote events. `corporate_action` events
currently broadcast to every connected client regardless of subscription
(they're infrequent enough that per-symbol filtering isn't worth the
complexity yet).

## Error format

Every non-2xx response: `{ "error": "human-readable message" }`. Common
codes: `400` (invalid/missing query param — validated by zod, see
`api/validators/querySchemas.ts`), `401` (missing/invalid API key), `404`
(unknown symbol/exchange), `429` (rate limit exceeded), `500` (unhandled
server error, logged server-side with full context).