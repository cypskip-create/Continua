import { Router } from "express";
import { financialsController } from "../controllers/financials.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { FinancialsQuerySchema, FinancialsHistoryQuerySchema } from "../validators/querySchemas.js";
import {publisherFinancialTables} from '../../services/research/publisherFinancialTables.js';
import {securitiesRepository} from '../../storage/repositories/securitiesRepository.js';
import {ApiError} from '../middleware/errorHandler.js';

export const financialsRoutes = Router();
financialsRoutes.get('/financials/:symbol/publisher-tables',asyncHandler(async(req,res)=>{
  const symbol=String(req.params.symbol).toUpperCase();
  if(!await securitiesRepository.getBySymbol('NSE',symbol))throw new ApiError(404,'Unknown NSE symbol');
  res.setHeader('Cache-Control','no-store');res.json({data:await publisherFinancialTables(symbol)});
}));
financialsRoutes.get("/financials/:symbol", validateQuery(FinancialsQuerySchema), asyncHandler(financialsController.getLatest));
financialsRoutes.get("/financials/:symbol/history", validateQuery(FinancialsHistoryQuerySchema), asyncHandler(financialsController.getHistory));
