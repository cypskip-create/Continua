import { Router } from "express";
import { instrumentsController } from "../controllers/instruments.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
export const instrumentsRoutes = Router();
instrumentsRoutes.get("/instruments", validateQuery(ExchangeQuery), asyncHandler(instrumentsController.list));
