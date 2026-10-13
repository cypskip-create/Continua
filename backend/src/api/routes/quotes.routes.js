import { Router } from "express";
import { quotesController } from "../controllers/quotes.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { QuotesBatchQuerySchema, ExchangeQuery } from "../validators/querySchemas.js";
export const quotesRoutes = Router();
quotesRoutes.get("/quotes", validateQuery(QuotesBatchQuerySchema), asyncHandler(quotesController.getBatch));
quotesRoutes.get("/quotes/:symbol", validateQuery(ExchangeQuery), asyncHandler(quotesController.getOne));
