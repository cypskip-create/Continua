import { ApiError } from "./errorHandler.js";
/** Parses req.query against a schema and stores the typed, defaulted result
 *  on req.validatedQuery — controllers read it via getQuery<T>(req) instead
 *  of re-deriving/re-checking values from the raw query object themselves. */
export function validateQuery(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const detail = result.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ");
            return next(new ApiError(400, `Invalid query parameters — ${detail}`));
        }
        req.validatedQuery = result.data;
        next();
    };
}
export function getQuery(req) {
    return req.validatedQuery;
}
