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
export declare function requireAdminKey(): (req: Request, _res: Response, next: NextFunction) => void;
