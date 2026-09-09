import { Router } from "express";
import { historicalController } from "../controllers/historical.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { HistoricalQuerySchema, PerformanceQuerySchema, SparklinesQuerySchema } from "../validators/querySchemas.js";

export const historicalRoutes = Router();
// Registered before /:symbol so "sparklines" is never swallowed as a symbol.
historicalRoutes.get("/historical/sparklines", validateQuery(SparklinesQuerySchema), asyncHandler(historicalController.getSparklines));
historicalRoutes.get("/historical/:symbol", validateQuery(HistoricalQuerySchema), asyncHandler(historicalController.getCandles));
historicalRoutes.get("/historical/:symbol/performance", validateQuery(PerformanceQuerySchema), asyncHandler(historicalController.getPerformance));