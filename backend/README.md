# Continua Data

The core market data infrastructure layer for Continua. NSE-first,
architected so every other African exchange can be added as a new adapter
without touching the rest of the system. See `docs/` for full documentation:

- `docs/architecture/ARCHITECTURE.md` — system overview, why it's shaped this way
- `docs/architecture/DATA_FLOW.md` — exactly what happens to data at each stage
- `docs/architecture/ADAPTER_PATTERN.md` — how to add NGX/JSE/EGX/GSE/BRVM
- `docs/data-model/DATABASE_SCHEMA.md` — table-by-table reference
- `docs/api/API.md` — every endpoint, including auth
- `docs/IMPLEMENTATION_ORDER.md` — what's built, what's next, what was verified

## Quick start — Docker Compose (recommended, one command)

```bash
cd backend
docker compose up
```

This starts Postgres (with `../supabase/migrations/*.sql` applied
automatically on first boot) and the backend together, networked. API on
`:4000`, WebSocket on `:4001`, a working dev key (`dev-local-only-key`)
pre-configured — nothing else to set up.

## Quick start — manual

```bash
npm install
cp .env.example .env    # then point DATABASE_URL at your Postgres instance
# apply supabase/migrations/030_market_schema.sql AND
#       supabase/migrations/031_production_readiness.sql to that database first

npm run dev              # starts API (port 4000) + WebSocket (4001) + all workers
npm test                 # unit tests (add DATABASE_URL to also run the integration test)
npm run typecheck        # tsc --noEmit
```

With `NSE_CLIENT_MODE=mock` (the default), this runs completely standalone —
no external NSE feed required. It generates realistic synthetic data for
17 real NSE-listed companies so every layer (ingestion → storage →
calculation → API) can be built and tested against today, before a licensed
feed is contracted. Flip to `NSE_CLIENT_MODE=live` once one is — see
`src/adapters/nse/nseClient.ts`.

## Authentication

Every `/api/v1/*` endpoint except `/api/v1/health` requires an API key —
`Authorization: Bearer <key>` or `X-API-Key: <key>`. WebSocket connections
need `?apiKey=<key>` on the connection URL.

```bash
npm run apikey:create -- "Some Customer Name"   # prints the plaintext key ONCE
npm run apikey:revoke -- <id>                   # revoke; takes effect within ~30s
```

For local dev, `.env`'s `DEV_API_KEY` works without creating a real key.
**Never set `DEV_API_KEY` in a deployed environment** — issue real,
revocable, individually-rate-limited keys instead. Set
`API_KEY_AUTH_ENABLED=false` to disable auth entirely (e.g. for a fully
internal/trusted-network deployment) — not recommended for anything
internet-facing.

## Project layout

```
backend/
├── src/
│   ├── adapters/       NSE today; NGX/JSE/EGX/GSE/BRVM placeholders in future/
│   ├── ingestion/       collectors, validators, pipelines, retry.ts
│   ├── normalization/   exchange-agnostic cleanup rules
│   ├── storage/         Postgres repositories + cache (memory or Redis)
│   ├── services/        research (ratios + AfriScore), market data, screening, analytics
│   ├── api/             Express routes/controllers/validators, versioned /api/v1
│   ├── streaming/        WebSocket server + pub/sub
│   ├── workers/          price/financials/corporate-actions/candles + scheduler
│   ├── monitoring/       logging, health checks, data-quality checks
│   ├── config/           env validation, trading calendar
│   └── types/            the standard schema every adapter maps into
├── tests/                unit tests + tests/integration (real-DB, self-skipping)
├── scripts/              API key management CLIs
├── Dockerfile
├── docker-compose.yml
└── docs → ../docs (see repo root)
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Full stack (API + WS + workers), hot-reload via `node --watch` |
| `npm run build` / `npm start` | Production build + run |
| `npm test` | Vitest unit tests. Set `DATABASE_URL` to also run the integration test. |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run worker:price` / `:financials` / `:candles` | Run one worker standalone (e.g. for a separate deployable later) |
| `npm run apikey:create` / `apikey:revoke` | Manage API keys |

## Production-readiness notes

- **Rate limiting**: per-API-key (using that key's own `rate_limit_per_min`),
  falling back to per-IP. Configure defaults via `RATE_LIMIT_WINDOW_MS` /
  `RATE_LIMIT_MAX_DEFAULT`.
- **Retries + dead-letter**: every adapter call retries with exponential
  backoff (`src/ingestion/retry.ts`). Anything that still fails — a
  validation rejection, an implausible price, a persistently-broken symbol
  — is recorded in `market.dead_letters`, not silently dropped.
- **Trading calendar**: the price worker's recurring interval only polls
  while NSE is actually open (`src/config/tradingCalendar.ts`); the
  one-time bootstrap seed pass ignores this so there's always data to start
  from. Set `IGNORE_TRADING_CALENDAR=true` for demos run outside market hours.
- **Cache**: `CACHE_DRIVER=memory` (default, per-process) or `redis`
  (shared across instances — set `REDIS_URL`).
