import { logger } from "../../monitoring/logger.js";
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
/** Wraps an async route handler so thrown/rejected errors reach errorHandler
 *  instead of crashing the process — Express doesn't do this automatically
 *  for async handlers. */
export function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err, req, res, _next) {
    if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
        return;
    }
    const parser = err;
    if (parser.type === 'entity.too.large') {
        res.status(413).json({ error: 'Request is too large.' });
        return;
    }
    if (parser.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Invalid JSON request.' });
        return;
    }
    // Error objects from body parsers can contain the submitted body. Never log
    // credentials, payment data or private notes through an error serializer.
    logger.error({ errorName: parser.name ?? 'Error', code: parser.code, path: req.path }, "Unhandled API error");
    res.status(500).json({ error: "Internal server error" });
}
