import { rateLimit } from "express-rate-limit";
/** Limits unverified requests before API-key/session checks and remote auth.
 * This is supplementary in-memory protection, not a distributed WAF or
 * protection for Supabase's separate /auth/v1/token endpoint. */
export function preAuthenticationRateLimit(limit = 120) {
  return rateLimit({
    windowMs: 60000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) =>
      !/^\/(engine|billing|admin)(?:\/|$)/.test(req.path) ||
      req.path === "/billing/paystack/webhook",
    message: {
      error:
        "Too many account or billing requests from this connection. Please retry shortly.",
    },
  });
}
