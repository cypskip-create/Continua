import { Router } from "express";
import { moversController } from "../controllers/movers.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { MoversQuerySchema } from "../validators/querySchemas.js";
export const moversRoutes = Router();
moversRoutes.get("/movers", validateQuery(MoversQuerySchema), asyncHandler(moversController.getMovers));
