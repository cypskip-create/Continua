import { Router } from "express";
import { adminFinancialsController } from "../controllers/adminFinancials.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const adminFinancialsRoutes = Router();
adminFinancialsRoutes.get("/financials/candidates", asyncHandler(adminFinancialsController.listPending));
adminFinancialsRoutes.get("/financials/candidates/:id", asyncHandler(adminFinancialsController.getOne));
adminFinancialsRoutes.post("/financials/candidates/:id/confirm", asyncHandler(adminFinancialsController.confirm));
adminFinancialsRoutes.post("/financials/candidates/:id/reject", asyncHandler(adminFinancialsController.reject));
adminFinancialsRoutes.get("/securities", asyncHandler(adminFinancialsController.listSecurities));