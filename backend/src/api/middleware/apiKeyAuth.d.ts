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
declare global {
    namespace Express {
        interface Request {
            apiKey?: ApiKeyRecord;
        }
    }
}
export declare function apiKeyAuth(): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
