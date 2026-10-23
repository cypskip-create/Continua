import {researchBatch} from '../controllers/researchBatch.js';
import { Router } from "express";
import { researchController } from "../controllers/research.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
export const researchRoutes = Router();
researchRoutes.get('/research/batch',asyncHandler((req,res)=>researchBatch(req,res,researchController.getResearch)));
researchRoutes.get("/research/:symbol", validateQuery(ExchangeQuery), asyncHandler(researchController.getResearch));
