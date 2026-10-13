import { findApiKey, recordApiKeyUse } from '../../services/apiKeyAccess.js';
import { env } from "../../config/index.js";
import { ApiError } from "./errorHandler.js";
function extractKey(req) {
    const header = req.header("authorization");
    if (header?.startsWith("Bearer "))
        return header.slice("Bearer ".length).trim();
    const apiKeyHeader = req.header("x-api-key");
    if (apiKeyHeader)
        return apiKeyHeader.trim();
    return null;
}
export function apiKeyAuth() {
    return async (req, _res, next) => {
        if (!env.API_KEY_AUTH_ENABLED)
            return next();
        const presented = extractKey(req);
        if (!presented)
            return next(new ApiError(401, "Missing API key — supply 'Authorization: Bearer <key>' or 'X-API-Key: <key>'"));
        if (env.DEV_API_KEY && presented === env.DEV_API_KEY) {
            req.apiKey = { id: "dev", name: "dev-key", active: true, rateLimitPerMin: env.RATE_LIMIT_MAX_DEFAULT };
            return next();
        }
        try {
            const record = await findApiKey(presented);
            if (!record)
                return next(new ApiError(401, "Invalid or revoked API key"));
            req.apiKey = record;
            recordApiKeyUse(record.id);
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
