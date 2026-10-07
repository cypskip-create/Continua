import { Router } from "express";
import { z } from "zod";
import { requireSubscriber } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { validateQuery, getQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
import { getEngineBundle } from "../../services/research/engineBundle.js";
export const engineRoutes = Router();
engineRoutes.get("/engine/:symbol", requireSubscriber, validateQuery(ExchangeQuery), asyncHandler(async (req,res)=>{
  const {exchange}=getQuery<z.infer<typeof ExchangeQuery>>(req);
  const symbol=String(req.params.symbol).toUpperCase();
  if(!/^[A-Z0-9.\-]{1,20}$/.test(symbol))throw new ApiError(400,"Invalid stock symbol");
  res.json({data:await getEngineBundle(symbol,exchange)});
}));
