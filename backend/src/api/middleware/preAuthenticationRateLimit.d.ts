/** Limits unverified requests before API-key/session checks and remote auth.
 * This is supplementary in-memory protection, not a distributed WAF or
 * protection for Supabase's separate /auth/v1/token endpoint. */
export declare function preAuthenticationRateLimit(limit?: number): import("express-rate-limit").RateLimitRequestHandler;
