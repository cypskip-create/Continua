import { Router } from "express";
import { valuationController } from "../controllers/valuation.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
import { z } from 'zod';
export const valuationRoutes = Router();
valuationRoutes.get('/valuation/:symbol/history', validateQuery(ExchangeQuery.extend({ ratio: z.enum(['pe', 'pb', 'ps']).default('pe'), years: z.coerce.number().int().min(1).max(10).default(5) })), asyncHandler(valuationController.history));
valuationRoutes.get("/valuation/:symbol", validateQuery(ExchangeQuery), asyncHandler(valuationController.get));
