# Continua

Continua is an African markets and investing platform. It combines live and
historical market data, portfolio tracking, company research, alerts,
screening, financial news, and an investor community in one mobile-first app.

## Services

- `app/` — React, Vite, TypeScript, Tailwind, React Query, and Supabase.
- `backend/` — Express REST/WebSocket market-data API, ingestion workers,
  research calculations, technical indicators, and multi-exchange adapters.
- `scraper/` — polite, robots-aware news and filing ingestion with RSS,
  HTML, PDF, OCR, deduplication, provenance, retries, and dead letters.
- `supabase/` — database migrations and Edge Functions.
- `docs/` — API, architecture, data-flow, and deployment documentation.

## Local development

```bash
npm install
npm run dev
```

The backend and scraper have their own dependencies and environment files:

```bash
cd backend && npm install && npm run dev
cd scraper && npm install && npm run dev
```

Copy each service's `.env.example` to `.env` and provide a PostgreSQL URL.
See `docs/deployment/RENDER_DEPLOY.md` for deployment configuration.

## Verification

```bash
npm run build
npx tsc --noEmit -p app/tsconfig.app.json
cd backend && npm run typecheck && npm test
cd scraper && npm run typecheck && npm test
```

The backend integration suite is opt-in because it truncates its dedicated
test database. Set `RUN_INTEGRATION_TESTS=true` with a migrated test-only
`DATABASE_URL` to run it.
