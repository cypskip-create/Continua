import { Router } from "express";
import { companiesController } from "../controllers/companies.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
export const companiesRoutes = Router();
companiesRoutes.get("/companies/:symbol", validateQuery(ExchangeQuery), asyncHandler(companiesController.getProfile));
