import { env } from "../../config/index.js";
import { ApiError } from "./errorHandler.js";
import {timingSafeEqual} from 'node:crypto';
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
        if (!presented || Buffer.byteLength(presented) > 512 || Buffer.byteLength(env.ADMIN_API_KEY) > 512 || presented.length !== env.ADMIN_API_KEY.length || !timingSafeEqual(
            paddedKey(presented), paddedKey(env.ADMIN_API_KEY))) {
            return next(new ApiError(401, "Missing or invalid admin key — supply 'X-Admin-Key: <key>'"));
        }
        next();
    };
}

function paddedKey(value) { const bytes = Buffer.alloc(512); bytes.write(value); return bytes; }
