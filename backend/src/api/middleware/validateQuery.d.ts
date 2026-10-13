import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
declare global {
    namespace Express {
        interface Request {
            validatedQuery?: unknown;
        }
    }
}
/** Parses req.query against a schema and stores the typed, defaulted result
 *  on req.validatedQuery — controllers read it via getQuery<T>(req) instead
 *  of re-deriving/re-checking values from the raw query object themselves. */
export declare function validateQuery<T>(schema: ZodType<T>): (req: Request, _res: Response, next: NextFunction) => void;
export declare function getQuery<T>(req: Request): T;
