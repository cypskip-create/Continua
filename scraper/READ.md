# Continua Scraper

The scraper is Continua's independent web-intelligence service. It discovers
and preserves public market material without competing with the live quote API
for CPU or memory.

It currently provides:

- declarative source registration and per-source schedules;
- immediate startup crawls plus recurring cron runs;
- official NSE announcement/PDF discovery with archive-page support;
- reusable RSS/Atom news ingestion with feed-summary fallback;
- robots.txt enforcement, SSRF protection, rate limiting, bounded downloads,
  retries, and dead-letter tracking;
- content hashing and artifact deduplication;
- HTML extraction, native PDF text extraction, table recovery, and OCR fallback;
- provenance and review metadata consumed by the backend news, announcement,
  and financial-statement bridges.

Built-in sources are inserted only when missing, so an operator's manual
configuration or disabled state is preserved across restarts.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

Use the same PostgreSQL instance as `backend/` and apply the scraper migrations
before startup. Raw local artifacts are staging data and may be re-fetched;
structured extraction records live in PostgreSQL.

## Verification

```bash
npm run typecheck
npm test
npm run build
```
