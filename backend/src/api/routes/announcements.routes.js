import { Router } from "express";
import { announcementsController } from "../controllers/announcements.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { AnnouncementsQuerySchema } from "../validators/querySchemas.js";
export const announcementsRoutes = Router();
announcementsRoutes.get("/announcements/:symbol", validateQuery(AnnouncementsQuerySchema), asyncHandler(announcementsController.getForSymbol));
