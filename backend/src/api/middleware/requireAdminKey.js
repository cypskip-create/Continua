import { env } from "../../config/index.js";
import { ApiError } from "./errorHandler.js";
function extractAdminKey(req) {
    const header = req.header("x-admin-key");
    if (header)
        return header.trim();
    const auth = req.header("authorization");
    if (auth?.startsWith("Bearer "))
        return auth.slice("Bearer ".length).trim();
    return null;
}
export function requireAdminKey() {
    return (req, _res, next) => {
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
