/**
 * Generic retry-with-backoff for anything that talks to an external
 * provider (an adapter's client calls). A single network hiccup shouldn't
 * turn into a dropped price tick or a skipped symbol in a fundamentals
 * sync — but retrying forever isn't right either, so this gives up after a
 * bounded number of attempts and lets the caller decide what "gave up"
 * means (log it, dead-letter it, skip the symbol for this run).
 */
import { logger } from "../monitoring/logger.js";

export interface RetryOptions {
  retries?: number;      // number of ATTEMPTS beyond the first, default 2 (3 total tries)
  baseDelayMs?: number;  // delay before the first retry, default 300ms
  factor?: number;       // exponential backoff multiplier, default 2
  label?: string;        // for log context
}

// 401/403/404/429 all mean "this call will not succeed no matter how many
// times you repeat it right now" for a provider like the previous provider: 401/403/404 are
// permanent auth/entitlement/not-found conditions, and 429 here specifically
// means "you've used your 100-requests/day allowance" (the provider's free tier is
// a flat daily cap, not a per-second burst limiter) — so a 300-600ms backoff
// retry can't fix it either, it just spends 2-3x the quota to arrive at the
// identical failure, every symbol, every run. Duck-typed on `.status`
// (rather than importing e.g. a provider error) so this stays generic across
// every adapter's own error type, present or future.
//
// NOTE: this assumes 429 == "quota exhausted for the day", which is true
// for the provider's documented free-tier limit. A provider whose 429 instead means
// "you're bursting too fast, slow down" would want 429 retried with backoff,
// not skipped — if withRetry is ever reused for such a provider, split this
// into a per-provider policy rather than assuming this rule generically.
const NON_RETRYABLE_STATUSES = new Set([401, 403, 404, 429]);

function isNonRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" && NON_RETRYABLE_STATUSES.has(status);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 300, factor = 2, label = "operation" } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || isNonRetryable(err)) {
        if (attempt < retries) {
          logger.warn({ label, err: String(err) }, "Not retrying — error indicates a permanent auth/entitlement/not-found condition or an exhausted daily quota, not a transient one");
        }
        break;
      }
      const delay = baseDelayMs * Math.pow(factor, attempt);
      logger.warn({ label, attempt: attempt + 1, retries, delayMs: delay, err: String(err) }, "Retrying after failure");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
