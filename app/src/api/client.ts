// Continua API client — the ONE place in the frontend that knows how to
// talk to the Continua Data Layer (backend/). Every api/*.ts module calls
// through this instead of using fetch() directly, so auth, base URL, and
// error handling live in one spot rather than scattered across components.
//
// See docs/api/API.md for the full contract this is built against.

export const AFRIFINANCE_API_URL =
  (import.meta.env.VITE_CONTINUA_API_URL as string | undefined) ??
  (import.meta.env.VITE_AFRIFINANCE_API_URL as string | undefined) ??
  "http://localhost:4000/api/v1";

export const AFRIFINANCE_WS_URL =
  (import.meta.env.VITE_CONTINUA_WS_URL as string | undefined) ??
  (import.meta.env.VITE_AFRIFINANCE_WS_URL as string | undefined) ??
  "ws://localhost:4001";

// DEV-ONLY key, read from Vite env (see app/.env). This is a first-party key
// for Continua's OWN backend, not an upstream NSE credential — but it is
// still visible in shipped browser JS via import.meta.env. That's an
// accepted tradeoff for local development only.
//
// PRODUCTION TODO: replace this constant with a short-lived token fetched
// from an authenticated endpoint (e.g. a Supabase Edge Function that holds
// the real Continua Data API key server-side and mints a scoped,
// per-user, expiring token). Nothing else in this file or its callers needs
// to change — swap what `getApiKey()` returns.
function getApiKey(): string {
  return (
    (import.meta.env.VITE_CONTINUA_API_KEY as string | undefined) ??
    (import.meta.env.VITE_AFRIFINANCE_API_KEY as string | undefined) ??
    "dev-local-only-key"
  );
}

export class ContinuaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string
  ) {
    super(message);
    this.name = "ContinuaApiError";
  }
}

export interface ContinuaRequestOptions {
  /** Query params. Undefined/null values are omitted; arrays are NOT joined
   *  here — pass a pre-joined string (e.g. symbols.join(",")) since a couple
   *  of endpoints want comma-separated values specifically. */
  params?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Defaults to GET. POST is used for the handful of endpoints that take
   *  a request body instead of query params — e.g. /backtest, whose
   *  strategy params don't fit cleanly in a query string. */
  method?: "GET" | "POST";
  body?: unknown;
}

function buildUrl(path: string, params?: ContinuaRequestOptions["params"]): string {
  const url = new URL(`${AFRIFINANCE_API_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Every non-2xx response from the API is `{ error: string }` per
 *  docs/api/API.md — this normalizes that (and network failures) into one
 *  typed error so callers can branch on `.status` (404 vs 401 vs 500 etc.)
 *  instead of re-parsing the response body everywhere. */
export async function continuaFetch<T>(path: string, options: ContinuaRequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.params);
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "X-API-Key": getApiKey(),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    throw new ContinuaApiError(
      err instanceof Error ? `Network error reaching Continua Data API: ${err.message}` : "Network error reaching Continua Data API",
      0,
      path
    );
  }

  if (!res.ok) {
    let message = `Continua Data API request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new ContinuaApiError(message, res.status, path);
  }

  const body = await res.json();
  return body.data as T;
}

/** True for a 404 from the Data Layer — "this symbol/exchange isn't in our
 *  universe", as opposed to a real failure. Callers use this to fall back
 *  to a "not covered yet" UI state rather than an error state. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ContinuaApiError && err.status === 404;
}