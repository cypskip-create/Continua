import { Router } from "express";
import { screenerController } from "../controllers/screener.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ScreenerQuerySchema } from "../validators/querySchemas.js";
export const screenerRoutes = Router();
screenerRoutes.get("/screener", validateQuery(ScreenerQuerySchema), asyncHandler(screenerController.run));
