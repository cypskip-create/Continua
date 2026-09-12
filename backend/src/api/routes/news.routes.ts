import { Router } from "express";
import { newsController } from "../controllers/news.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { NewsQuerySchema, SecurityNewsQuerySchema } from "../validators/querySchemas.js";

export const newsRoutes = Router();
newsRoutes.get("/news", validateQuery(NewsQuerySchema), asyncHandler(newsController.listRecent));
newsRoutes.get("/news/:symbol", validateQuery(SecurityNewsQuerySchema), asyncHandler(newsController.getForSymbol));