/**
 * Per-hostname rate limiting (§20 — "do not hammer websites", per-domain
 * limits). Single in-memory map keyed by hostname — sufficient for a
 * single-instance service; if this ever needs to run as multiple
 * replicas, this needs to move to Redis (matching the note in db.ts
 * about ADAPTER_MODE and Redis being deferred until actually needed).
 *
 * This is intentionally simple: track the last request timestamp per
 * host, and if a new request arrives before the minimum interval has
 * elapsed, wait out the remainder. Not a true token bucket (no burst
 * allowance) — for a crawler that's a feature, not a limitation: bursts
 * are exactly what §20 asks to avoid.
 */
const lastRequestAt = new Map();
export async function throttleHost(hostname, requestsPerSecond) {
    if (requestsPerSecond <= 0)
        return; // 0 or negative = no limit, used sparingly and deliberately
    const minIntervalMs = 1000 / requestsPerSecond;
    const last = lastRequestAt.get(hostname);
    const now = Date.now();
    if (last !== undefined) {
        const elapsed = now - last;
        const waitMs = minIntervalMs - elapsed;
        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
    }
    lastRequestAt.set(hostname, Date.now());
}
