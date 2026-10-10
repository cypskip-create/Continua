// Continua API client — the ONE place in the frontend that knows how to
// talk to the Continua Data Layer (backend/). Every api/*.ts module calls
// through this instead of using fetch() directly, so auth, base URL, and
// error handling live in one spot rather than scattered across components.
//
// See docs/api/API.md for the full contract this is built against.

import { supabase } from "@/integrations/supabase/client";
import { resolveApiEndpoint } from "./apiEndpoint";
import { fetchWithRateLimitRecovery } from "./rateLimitRecovery";
import { DataApiResponseError, readApiData } from "./apiResponse";

const endpoints = resolveApiEndpoint(
  (import.meta.env.VITE_CONTINUA_API_URL as string | undefined) ??
  (import.meta.env.VITE_AFRIFINANCE_API_URL as string | undefined),
  import.meta.env.PROD,
);
export const AFRIFINANCE_API_URL = endpoints.rest;

function deriveWebSocketUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

// The WebSocket server is attached to the same HTTP server as REST. Derive
// the correct origin by default so local/dev deployments cannot silently
// point live quotes at the old, unused :4001 listener.
export const AFRIFINANCE_WS_URL =
  (import.meta.env.VITE_CONTINUA_WS_URL as string | undefined) ??
  (import.meta.env.VITE_AFRIFINANCE_WS_URL as string | undefined) ??
  deriveWebSocketUrl(endpoints.upstream);

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
    public readonly path: string,
    public readonly stage: "session" | "connection" | "body" | "response" | "timeout" | "cancelled" = "response",
    public readonly responseStatus?: number
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
  method?: "GET" | "POST" | "DELETE";
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
  let subscriberHeaders: Record<string, string> = {};
  if (/^\/(engine|backtest|volume-profile)(\/|$)/.test(path)) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new ContinuaApiError("Sign in to use Continua Engine", 401, path, "session");
    subscriberHeaders = { "X-User-Token": session.access_token, "X-Supabase-Key": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY };
  }
  const url = buildUrl(path, options.params);
  const controller = new AbortController();
  // Company bundles can wait for profile + optional feeds + snapshot storage.
  // A 12-second client timeout used to abort valid Engine responses mid-flight.
  const timeout = window.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), path.startsWith("/engine/") || path.startsWith("/market-research/") ? 45_000 : 12_000);
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  let res: Response | undefined;
  try {
    res = await fetchWithRateLimitRecovery(url, {
      method: options.method ?? "GET",
      headers: {
        "X-API-Key": getApiKey(),
        ...subscriberHeaders,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    return await readApiData<T>(res);
  } catch (err) {
    if (err instanceof DataApiResponseError) throw new ContinuaApiError(err.message, err.status, path, "response", err.responseStatus);
    if (err instanceof ContinuaApiError) throw err;
    if (options.signal?.aborted) throw new ContinuaApiError("Request cancelled", 499, path, "cancelled", res?.status);
    throw new ContinuaApiError(
      controller.signal.aborted && !options.signal?.aborted
        ? "Engine connection timed out. The server may be waking up; retry shortly."
        : "Could not connect to Continua Data API. Check your connection and retry.",
      0,
      path,
      controller.signal.aborted ? "timeout" : res ? "body" : "connection",
      res?.status
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }

}

/** True for a 404 from the Data Layer — "this symbol/exchange isn't in our
 *  universe", as opposed to a real failure. Callers use this to fall back
 *  to a "not covered yet" UI state rather than an error state. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ContinuaApiError && err.status === 404;
}

/** User-triggered, read-only diagnostics. Never include credentials, account
 * identifiers, response bodies, holdings or request headers in the report. */
export async function testEngineConnection(target: "portfolio" | "monitoring" | "preferences" = "preferences", exchange = "NSE"): Promise<string> {
  const path = `/engine/${target}`;
  const report = [
    `Checked: ${new Date().toISOString()}`,
    `App origin: ${window.location.origin}`,
    `API origin: ${new URL(AFRIFINANCE_API_URL).origin}`,
    `Checked endpoint: ${path}`,
  ];
  try {
    const response = await fetch(`${AFRIFINANCE_API_URL}/health`, {cache:"no-store", signal:AbortSignal.timeout(15_000)});
    report.push(`Public health: HTTP ${response.status}`);
  } catch {
    report.push("Public health: no usable HTTP response (network, browser restriction or timeout)");
  }
  const started = Date.now();
  try {
    await continuaFetch(path, {params:target === "portfolio" ? {exchange} : undefined});
    report.push("Authenticated Engine read: passed (usable JSON data received)");
  } catch (error) {
    if (error instanceof ContinuaApiError) {
      report.push(`Authenticated Engine read: failed at ${error.stage}; application status ${error.status}; HTTP ${error.responseStatus ?? "not available"}`);
    } else {
      report.push("Authenticated Engine read: session setup failed before an API result");
    }
  }
  report.push(`Authenticated request elapsed: ${Date.now() - started} ms`);
  return report.join("\n");
}
