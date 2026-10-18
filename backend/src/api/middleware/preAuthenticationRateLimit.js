import { ipKeyGenerator } from "express-rate-limit";
import {rateLimitClientIP} from './edgeClientIdentity.js';
import {protectedRateLimit} from './sharedRateStore.js';
/** Limits unverified requests before API-key/session checks and remote auth.
 * Uses the configured shared counter, or bounded single-process memory.
 * Supabase's separate /auth/v1/token endpoint has its own provider policies. */
export function preAuthenticationRateLimit(limit = 120) {
    return protectedRateLimit({
        windowMs: 60000,
        limit,
        keyGenerator:(req,res)=>ipKeyGenerator(rateLimitClientIP(req,res)),
        standardHeaders: "draft-7",
        legacyHeaders: false,
        skip: (req) => /^\/health(?:\/|$)/.test(req.path) || req.path === "/billing/paystack/webhook",
        message: {
            error: "Too many requests from this connection. Please retry shortly.", code:"RATE_LIMITED",
        },
    },'preauth');
}
