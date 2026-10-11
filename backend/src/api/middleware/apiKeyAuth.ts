/**
 * Requires a valid API key on every request this is mounted before.
 * Accepts either `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 *
 * Lookups are cached for a short TTL (not forever) so a freshly-revoked key
 * stops working within seconds rather than staying valid until process
 * restart, while still avoiding a DB round-trip on every single request.
 */
import type { Request, Response, NextFunction } from "express";
import { type ApiKeyRecord } from "../../storage/repositories/apiKeyRepository.js";
import { findApiKey, recordApiKeyUse } from '../../services/apiKeyAccess.js';
import { env } from "../../config/index.js";
import { ApiError } from "./errorHandler.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRecord;
    }
  }
}

function extractKey(req: Request): string | null {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  const apiKeyHeader = req.header("x-api-key");
  if (apiKeyHeader) return apiKeyHeader.trim();
  return null;
}

export function apiKeyAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!env.API_KEY_AUTH_ENABLED) return next();

    const presented = extractKey(req);
    if (!presented) return next(new ApiError(401, "Missing API key — supply 'Authorization: Bearer <key>' or 'X-API-Key: <key>'"));

    if (env.DEV_API_KEY && presented === env.DEV_API_KEY) {
      req.apiKey = { id: "dev", name: "dev-key", active: true, rateLimitPerMin: env.RATE_LIMIT_MAX_DEFAULT };
      return next();
    }

    try {
      const record = await findApiKey(presented);
      if (!record) return next(new ApiError(401, "Invalid or revoked API key"));
      req.apiKey = record;
      recordApiKeyUse(record.id);
      next();
    } catch (err) {
      next(err);
    }
  };
}
