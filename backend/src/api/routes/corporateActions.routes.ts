import { Router } from "express";
import { corporateActionsController } from "../controllers/corporateActions.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";

export const corporateActionsRoutes = Router();
corporateActionsRoutes.get("/corporate-actions/:symbol", validateQuery(ExchangeQuery), asyncHandler(corporateActionsController.getForSymbol));
// Literal paths registered BEFORE the :symbol param routes below —
// Express matches in registration order, so "/dividends/upcoming" would
// otherwise be swallowed as :symbol="upcoming".
corporateActionsRoutes.get("/dividends/upcoming", asyncHandler(corporateActionsController.getUpcomingDividends));
corporateActionsRoutes.get("/earnings/recent", asyncHandler(corporateActionsController.getRecentEarnings));
corporateActionsRoutes.get("/dividends/:symbol", validateQuery(ExchangeQuery), asyncHandler(corporateActionsController.getDividends));
corporateActionsRoutes.get("/ownership/:symbol", validateQuery(ExchangeQuery), asyncHandler(corporateActionsController.getOwnership));