import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/index.js";
import { query } from "../../storage/db.js";
import { ApiError } from "./errorHandler.js";

// Verify the session against this project's auth service; never trust a
// client-provided user ID or subscription flag. The project key is public.
export async function requireEngineUser(req: Request, res: Response, next: NextFunction) {
  // Identity is reused only within this request, after server verification.
  if (res.locals?.engineIdentityVerified === true) return next();
  try {
    const token = req.header("x-user-token");
    const publicKey = req.header("x-supabase-key");
    if (!token || !publicKey) throw new ApiError(401, "Sign in to use Continua Engine");
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: publicKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) throw new ApiError(401, "Your session expired. Sign in again.");
    if (!response.ok) throw new ApiError(503, "Unable to verify Engine access. Please retry.");
    const user = await response.json() as { id?: string };
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new ApiError(401, "Invalid user session");
    const profile = await query<{ subscription_plan: string }>(
      "SELECT subscription_plan FROM public.profiles WHERE user_id = $1", [user.id],
    );
    res.locals ??= {};
    res.locals.engineUserId = user.id;
    res.locals.enginePlan = profile.rows[0]?.subscription_plan ?? "free";
    res.locals.engineIdentityVerified = true;
    next();
  } catch (error) { next(error); }
}

/** Isolate verified Engine users from the public market-data key's bucket.
 * Never derive a limiter identity from unverified JWT claims or user headers. */
export function verifyEngineRateLimitIdentity(req: Request, res: Response, next: NextFunction) {
  if (!/^\/engine(?:\/|$)/.test(req.path)) return next();
  return requireEngineUser(req, res, next);
}

export async function requireSubscriber(req: Request, res: Response, next: NextFunction) {
  await requireEngineUser(req, res, error => {
    if (error) return next(error);
    if (!["premium", "premium_plus"].includes(res.locals.enginePlan)) {
      return next(new ApiError(403, "Continua Engine is included with Premium. Upgrade to unlock it."));
    }
    next();
  });
}

/** Full workspace tools are Plus-only; expanded Fundamentals stays available on Premium. */
export async function requirePremiumPlus(req: Request, res: Response, next: NextFunction) {
  await requireEngineUser(req, res, error => {
    if (error) return next(error);
    if (res.locals.enginePlan !== "premium_plus") return next(new ApiError(403, "Upgrade to Premium Plus to use the full Continua Engine."));
    next();
  });
}
