import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
export const healthRoutes = Router();
healthRoutes.get('/health/live',asyncHandler(healthController.live));
healthRoutes.get("/health", asyncHandler(healthController.check));
