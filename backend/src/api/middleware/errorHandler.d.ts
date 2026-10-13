import type { Request, Response, NextFunction } from "express";
export declare class ApiError extends Error {
    status: number;
    constructor(status: number, message: string);
}
/** Wraps an async route handler so thrown/rejected errors reach errorHandler
 *  instead of crashing the process — Express doesn't do this automatically
 *  for async handlers. */
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): (req: Request, res: Response, next: NextFunction) => void;
export declare function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void;
