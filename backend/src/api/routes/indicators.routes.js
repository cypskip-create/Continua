import { Router } from "express";
import { indicatorsController } from "../controllers/indicators.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { IndicatorQuerySchema } from "../validators/querySchemas.js";
export const indicatorsRoutes = Router();
indicatorsRoutes.get("/indicators/:symbol", validateQuery(IndicatorQuerySchema), asyncHandler(indicatorsController.get));
