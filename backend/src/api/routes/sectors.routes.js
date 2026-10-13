import { Router } from "express";
import { sectorsController } from "../controllers/sectors.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
export const sectorsRoutes = Router();
sectorsRoutes.get("/sectors", asyncHandler(sectorsController.list));
