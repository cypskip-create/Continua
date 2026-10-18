/** Limits unverified requests before API-key/session checks and remote auth.
 * Uses the configured shared counter, or bounded single-process memory.
 * Supabase's separate /auth/v1/token endpoint has its own provider policies. */
export declare function preAuthenticationRateLimit(limit?: number): import("express-rate-limit").RateLimitRequestHandler;
