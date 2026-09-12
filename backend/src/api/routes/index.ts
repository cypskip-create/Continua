import { Router } from "express";
import { quotesRoutes } from "./quotes.routes.js";
import { historicalRoutes } from "./historical.routes.js";
import { companiesRoutes } from "./companies.routes.js";
import { financialsRoutes } from "./financials.routes.js";
import { corporateActionsRoutes } from "./corporateActions.routes.js";
import { announcementsRoutes } from "./announcements.routes.js";
import { newsRoutes } from "./news.routes.js";
import { moversRoutes } from "./movers.routes.js";
import { sectorsRoutes } from "./sectors.routes.js";
import { researchRoutes } from "./research.routes.js";
import { screenerRoutes } from "./screener.routes.js";
import { instrumentsRoutes } from "./instruments.routes.js";
import { indicesRoutes } from "./indices.routes.js";
import { indicatorsRoutes } from "./indicators.routes.js";
import { backtestRoutes } from "./backtest.routes.js";
import { volumeProfileRoutes } from "./volumeProfile.routes.js";
import { valuationRoutes } from "./valuation.routes.js";

/** Every route is mounted under /api/v1. Versioning from day one — the app,
 *  TradersHub, and Media all consume this same v1 contract; a v2 later can
 *  be added alongside it without breaking existing clients.
 *
 *  NOTE: health.routes.ts is intentionally NOT included here — it's mounted
 *  separately in server.ts, ahead of the auth/rate-limit middleware, so
 *  infra probes (load balancer health checks, uptime monitors) never need
 *  an API key and never count against anyone's rate limit. */
export const apiRouter = Router();
apiRouter.use(quotesRoutes);
apiRouter.use(historicalRoutes);
apiRouter.use(companiesRoutes);
apiRouter.use(financialsRoutes);
apiRouter.use(corporateActionsRoutes);
apiRouter.use(announcementsRoutes);
apiRouter.use(newsRoutes);
apiRouter.use(moversRoutes);
apiRouter.use(sectorsRoutes);
apiRouter.use(researchRoutes);
apiRouter.use(screenerRoutes);
apiRouter.use(instrumentsRoutes);
apiRouter.use(indicesRoutes);
apiRouter.use(indicatorsRoutes);
apiRouter.use(backtestRoutes);
apiRouter.use(volumeProfileRoutes);
apiRouter.use(valuationRoutes);