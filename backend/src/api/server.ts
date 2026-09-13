import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes/index.js";
import { healthRoutes } from "./routes/health.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { requireAdminKey } from "./middleware/requireAdminKey.js";
import { adminFinancialsRoutes } from "./routes/admin.routes.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

// Requests are already gated behind an API key (see apiKeyAuth below), so an
// open CORS policy was never a data-access hole — but leaving `cors()` with
// no origin option means ANY website can drive this API straight from a
// visitor's browser using their own key. Locking Access-Control-Allow-Origin
// to our own frontend(s) closes that off. Non-browser callers (curl, the
// mobile app, server-to-server) don't send an Origin header at all and are
// unaffected — CORS is a browser-only mechanism.
const allowedOrigins = new Set(env.ALLOWED_ORIGINS);

// Every Vercel deployment of this project — production or preview — gets its
// own unique URL like https://continua-<hash>-cypskip-creates-projects.vercel.app,
// on top of the one stable alias (https://continua-cypskip-creates-projects.vercel.app).
// Chasing each new hash by hand in ALLOWED_ORIGINS doesn't scale with how often
// this ships, so recognize the whole family by pattern instead of exact string.
// Update the slug below if the Vercel project/team is ever renamed.
const VERCEL_PROJECT_ORIGIN = /^https:\/\/continua(-[a-z0-9-]+)?-cypskip-creates-projects\.vercel\.app$/;

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || VERCEL_PROJECT_ORIGIN.test(origin)) {
      callback(null, true);
      return;
    }
    logger.warn({ origin }, "Blocked CORS request from disallowed origin");
    callback(new Error("Not allowed by CORS"));
  },
};

export function createServer() {
  const app = express();
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(requestLogger);

  // Health stays open and unmetered — infra probes shouldn't need a key or
  // count against anyone's rate limit.
  app.use("/api/v1", healthRoutes);

  // Own auth (a single shared admin secret, not a public API key) and no
  // rate limit — this is you reviewing financial statements, not a public
  // consumer. Registered before the general apiKeyAuth+apiRouter mount so
  // a matched admin route never falls through to public-key auth.
  app.use("/api/v1/admin", requireAdminKey(), adminFinancialsRoutes);

  app.use("/api/v1", apiKeyAuth(), apiRateLimit(), apiRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  return app;
}