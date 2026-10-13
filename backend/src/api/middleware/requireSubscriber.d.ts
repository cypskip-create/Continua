import type { Request, Response, NextFunction } from "express";
export declare function requireEngineUser(req: Request, res: Response, next: NextFunction): Promise<void>;
/** Isolate verified Engine users from the public market-data key's bucket.
 * Never derive a limiter identity from unverified JWT claims or user headers. */
export declare function verifyEngineRateLimitIdentity(req: Request, res: Response, next: NextFunction): void | Promise<void>;
export declare function requireSubscriber(req: Request, res: Response, next: NextFunction): Promise<void>;
/** Full workspace tools are Plus-only; expanded Fundamentals stays available on Premium. */
export declare function requirePremiumPlus(req: Request, res: Response, next: NextFunction): Promise<void>;
