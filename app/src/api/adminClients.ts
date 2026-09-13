// Separate from client.ts's continuaFetch on purpose: that always sends the
// public X-API-Key; this always sends X-Admin-Key instead, hitting
// /api/v1/admin/* (see backend/src/api/middleware/requireAdminKey.ts). The
// admin key is entered once in the browser (AdminFinancialsReview.tsx's
// gate) and kept in sessionStorage — cleared when the tab closes, never
// sent anywhere except this backend.
import { AFRIFINANCE_API_URL, ContinuaApiError } from "./client";

const SESSION_KEY = "continua-admin-key";

export function getAdminKey(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(SESSION_KEY, key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

interface AdminRequestOptions {
  method?: "GET" | "POST";
  params?: Record<string, string | number | undefined>;
  body?: unknown;
}

export async function adminFetch<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new ContinuaApiError("No admin key set", 401, path);

  const url = new URL(`${AFRIFINANCE_API_URL}/admin${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        "X-Admin-Key": key,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new ContinuaApiError(err instanceof Error ? err.message : "Network error", 0, path);
  }

  if (!res.ok) {
    let message = `Admin request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // not JSON — keep generic message
    }
    if (res.status === 401) clearAdminKey(); // stale/wrong key — force re-entry rather than looping 401s
    throw new ContinuaApiError(message, res.status, path);
  }

  const body = await res.json();
  return body as T;
}