/**
 * Generic retry with exponential backoff + jitter (§20-21 of the
 * original spec). Not every failure is worth retrying — a 404 or a
 * robots.txt-disallowed URL will fail identically every time, so callers
 * pass an `isRetryable` predicate rather than this module guessing from
 * the error alone.
 */
import { logger } from "../monitoring/logger.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function withRetry(fn, options) {
    const { maxRetries, baseDelayMs, isRetryable = () => true } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            const isLastAttempt = attempt === maxRetries;
            if (isLastAttempt || !isRetryable(err)) {
                throw err;
            }
            // Exponential backoff with jitter: base * 2^attempt, +/- 20% random
            // spread so many simultaneously-failing requests don't all retry
            // in lockstep.
            const exponentialDelay = baseDelayMs * 2 ** attempt;
            const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
            const delay = Math.max(0, exponentialDelay + jitter);
            options.onRetry?.(attempt + 1, err);
            logger.debug({ attempt: attempt + 1, maxRetries, delayMs: Math.round(delay) }, "Retrying after failure");
            await sleep(delay);
        }
    }
    throw lastError;
}
