/**
 * Gates /api/v1/admin/* — separate from apiKeyAuth.ts's public API keys on
 * purpose. Those grant read access to market data at a rate limit; this
 * grants the ability to write confirmed financial statements, so it's a
 * single shared secret you set yourself (Render dashboard → Environment →
 * ADMIN_API_KEY), not a per-consumer key issued through the DB-backed
 * apiKeyRepository flow. No shell/CLI needed to set it up or rotate it.
 *
 * Fails CLOSED: if ADMIN_API_KEY isn't set at all, every request is
 * refused — there's no "admin auth disabled" mode the way
 * API_KEY_AUTH_ENABLED has for the public API.
 */
import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/index.js";
import { ApiError } from "./errorHandler.js";

function extractAdminKey(req: Request): string | null {
  const header = req.header("x-admin-key");
  if (header) return header.trim();
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return null;
}

export function requireAdminKey() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!env.ADMIN_API_KEY) {
      return next(new ApiError(503, "Admin routes are not configured — set ADMIN_API_KEY."));
    }
    const presented = extractAdminKey(req);
    if (!presented || presented !== env.ADMIN_API_KEY) {
      return next(new ApiError(401, "Missing or invalid admin key — supply 'X-Admin-Key: <key>'"));
    }
    next();
  };
}