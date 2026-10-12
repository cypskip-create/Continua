import type { Request, Response, NextFunction } from "express";
import { logger } from "../../monitoring/logger.js";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps an async route handler so thrown/rejected errors reach errorHandler
 *  instead of crashing the process — Express doesn't do this automatically
 *  for async handlers. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const parser=err as {type?:string;status?:number;name?:string;code?:string};
  if(parser.type==='entity.too.large'){res.status(413).json({error:'Request is too large.'});return;}
  if(parser.type==='entity.parse.failed'){res.status(400).json({error:'Invalid JSON request.'});return;}
  // Error objects from body parsers can contain the submitted body. Never log
  // credentials, payment data or private notes through an error serializer.
  logger.error({ errorName:parser.name??'Error',code:parser.code,path:req.path }, "Unhandled API error");
  res.status(500).json({ error: "Internal server error" });
}
