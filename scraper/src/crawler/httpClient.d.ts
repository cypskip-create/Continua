export declare class FetchTooLargeError extends Error {
}
export declare class FetchTimeoutError extends Error {
}
export interface FetchResult {
    finalUrl: string;
    status: number;
    headers: Headers;
    body: Buffer;
}
export declare function safeFetch(url: string, opts?: {
    maxBytes?: number;
    timeoutMs?: number;
    requestsPerSecond?: number;
    form?: Record<string, string>;
}): Promise<FetchResult>;
/**
 * safeFetch wrapped with exponential backoff (§20-21). Distinguishes
 * transient failures worth retrying (timeouts, 429/5xx — the server or
 * network is temporarily unhappy) from permanent ones that will fail
 * identically every time (404, SSRF-blocked, oversized response) —
 * retrying the latter just wastes time and hammers a server that's
 * already telling us no.
 */
export declare function fetchWithRetry(url: string, opts?: {
    maxBytes?: number;
    timeoutMs?: number;
    requestsPerSecond?: number;
    maxRetries?: number;
    baseDelayMs?: number;
    form?: Record<string, string>;
}): Promise<FetchResult>;
