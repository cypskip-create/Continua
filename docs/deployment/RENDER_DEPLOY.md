# Deploying continua-data + continua-scraper to Render

Moves `backend/` and `scraper/` off Railway onto Render's free tier. The
frontend (`app/`) is unaffected — it stays on Vercel.

## The short version

Both services are **Web Services** (not Background Workers, not Cron
Jobs). Each one is a single Node process that runs its own HTTP server
*and* its own internal cron-scheduled workers together (see
`backend/src/index.ts` / `scraper/src/index.ts`) — that's already how they
ran on Railway, and it's exactly what a Render Web Service is for. There's
nothing left over that a separate worker or cron service would run.

Good news on the database: **nothing about your data needs to move.**
`backend/src/storage/db.ts` says it directly — this backend writes into
the `market` schema of the *same* Postgres instance your Supabase project
already uses (the scraper does the same with the `scraping` schema). So
"migrate off Railway" here just means "move two Node processes to a new
host and point them at the `DATABASE_URL` you already have" — not a data
migration.

## 1. Confirm where DATABASE_URL actually points

Before anything else, check Railway's dashboard for the `DATABASE_URL` your
current backend/scraper services use:

- **If it's already a Supabase connection string** (host contains
  `supabase.co` or `supabase.com`) — you're done, skip to step 2, reuse
  that exact value on Render.
- **If it's a Railway-provisioned Postgres add-on instead** — your data is
  currently living in Railway's Postgres, not Supabase's, and you'll need
  to `pg_dump` it and `pg_restore` it into your Supabase Postgres (schemas
  `market` + `scraping`) before cutting over, since the whole point of this
  setup is one shared database. Say so if this is the case and I'll walk
  through that dump/restore.

If you're not sure, get the connection string from Supabase directly
either way — **Project Settings → Database → Connection string**. Use the
**Session pooler** string (not "Transaction"), since this is a persistent
long-running server making regular queries, not a serverless function —
Transaction-mode pooling has prepared-statement quirks that Session mode
and a direct connection don't.

## 2. Deploy via the Blueprint

A `render.yaml` at the repo root already defines both services.

1. Push this repo to GitHub if it isn't already connected.
2. Render dashboard → **New** → **Blueprint** → select this repo/branch.
3. Render parses `render.yaml` and shows two services:
   `continua-backend` and `continua-scraper`. Click **Apply**.
4. For **each** service, Render will have left some environment variables
   blank (marked `sync: false` in the file, since real secrets don't
   belong committed to git) — fill these in under that service's
   **Environment** tab:

   **continua-backend**
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The Session-pooler string from step 1 |
   | `ALLOWED_ORIGINS` | Your Vercel production domain(s), comma-separated, e.g. `https://your-app.vercel.app` — no trailing slash, no spaces after commas |

   **continua-scraper**
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The *same* string as above |

5. Optional, only if you were running these on Railway: if you had
   `ADAPTER_MODE=live` + `MANSA_API_KEY` set for real (non-mock) market
   data, add those two as additional env vars on `continua-backend` now —
   they're not in `render.yaml` because they have safe defaults
   (`ADAPTER_MODE=mock`) and there's no reason to force you to fill them
   in blank if you don't use them.
6. Save — each service will build its Dockerfile and deploy. First build
   will take a few minutes, longer for the scraper (Playwright's browser
   image is large).

## 3. Issue a real API key for the frontend to use

The backend's `/api/v1/*` routes require an API key. Don't reuse a
`DEV_API_KEY` in production (the code explicitly warns against this).
Render's free plan doesn't include shell access to a running instance, so
run the key-creation script from your own machine, pointed at the same
production database:

```bash
cd backend
DATABASE_URL="<the same Session-pooler string from step 1>" npm run apikey:create -- "Continua frontend"
```

This prints the plaintext key once — copy it now, it can't be recovered
later (only revoked/reissued).

## 4. Point the Vercel frontend at the new backend

In Vercel's project settings → Environment Variables, set (Production, and
Preview if you want previews hitting the same backend too):

| Variable | Value |
|---|---|
| `VITE_CONTINUA_API_URL` | `https://continua-backend.onrender.com/api/v1` (use your service's actual `.onrender.com` URL from its Render dashboard page) |
| `VITE_CONTINUA_WS_URL` | `wss://continua-backend.onrender.com` |
| `VITE_CONTINUA_API_KEY` | The key from step 3 |

Redeploy the Vercel project (or it'll pick these up on the next deploy)
for the change to take effect — Vite bakes env vars in at build time, not
runtime.

## Free-tier tradeoffs, honestly

This is the part that matters most for a live-price app, since it's the
actual cost of "free":

- **Both services spin down after ~15 minutes with no inbound HTTP
  traffic**, and take 30–50 seconds to wake back up on the next request.
  While a service is asleep, its internal cron workers aren't running
  either — so price polling, the alert sweep, financials sync, etc. all
  pause during that window, not just the API. This is the real cost of
  free here, not just a slow first click.
  - A common workaround: point a free external uptime pinger (UptimeRobot,
    cron-job.org, etc.) at each service's health endpoint
    (`/api/v1/health` for the backend, `/health` for the scraper) every
    10 minutes, so it never goes fully idle. This is a widely-used pattern,
    but it does run somewhat against the spirit of a free tier meant for
    idle services — if it ever matters enough, Render's paid Starter plan
    ($7/mo per service) removes spin-down entirely.
- **512MB RAM per service.** The backend should be comfortably within
  that. The scraper runs a real headless Chromium via Playwright — one
  instance, reused across crawls (not one per page), which is the
  efficient shape for this constraint, but a heavy PDF/page load could
  still be tight. If you see the scraper getting OOM-killed in its Render
  logs, that's the free tier's ceiling, not a bug — the fix is Render's
  Starter plan for that one service.
- **Ephemeral disk.** Scraped raw artifacts (`RAW_STORAGE_DRIVER=local`,
  the only storage driver actually implemented right now — see
  `scraper/src/storage/rawStorage.ts`) live on local disk, which Render
  wipes on every deploy and restart, same as it would on Railway without
  a paid persistent volume. In this pipeline that's an acceptable
  tradeoff: raw artifacts are re-fetchable staging data, not the system
  of record — extraction already writes the structured result into
  Postgres. Worth knowing, not worth blocking on.

## One more thing worth double-checking

`app/.env` (local dev) has `VITE_SUPABASE_PROJECT_ID="jjsetogmnumoudrovpzn"`,
but `supabase/config.toml`'s `project_id` is `iqrhndggnbscoypkwrvk` — two
different Supabase projects referenced in the same repo. Confirm which one
is actually live in Vercel's production env vars before pulling
`DATABASE_URL` in step 1, so the backend ends up writing into the same
project the frontend reads from — pulling from the wrong one would mean
the app and the data layer are silently talking to two different
databases.

## After it's verified working

Delete the Railway services once traffic on Render looks healthy for a few
days — Railway keeps billing until they're actually removed, not just
unused.