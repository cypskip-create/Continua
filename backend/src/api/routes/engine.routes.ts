import { Router } from "express";
import { z } from "zod";
import { requireSubscriber } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { validateQuery, getQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
import { getEngineBundle } from "../../services/research/engineBundle.js";
export const engineRoutes = Router();
engineRoutes.get("/engine/research-access/:symbol", requireSubscriber, validateQuery(ExchangeQuery), asyncHandler(async (_req,res)=>{
  res.json({data:{allowed:true}});
}));
engineRoutes.get("/engine/basic/:symbol", requireSubscriber, validateQuery(ExchangeQuery), asyncHandler(async (req,res)=>{
  const {exchange}=getQuery<z.infer<typeof ExchangeQuery>>(req);
  const symbol=String(req.params.symbol).toUpperCase();
  if(!/^[A-Z0-9.\-]{1,20}$/.test(symbol))throw new ApiError(400,"Invalid stock symbol");
  const b=await getEngineBundle(symbol,exchange);
  res.json({data:{symbol:b.symbol,companyName:b.companyName,currency:b.currency,quote:b.quote,generatedAt:b.generatedAt,briefing:b.briefing,estimates:b.estimates.map(e=>({fiscalYear:e.fiscalYear,fiscalQuarter:e.fiscalQuarter,epsEstimate:e.epsEstimate,revenueEstimate:e.revenueEstimate})),coverage:b.coverage,unavailable:b.unavailable}});
}));
// Company research also powers Premium Fundamentals expansions. Personal
// workspace endpoints retain their independent Premium Plus checks.
engineRoutes.get("/engine/:symbol", requireSubscriber, validateQuery(ExchangeQuery), asyncHandler(async (req,res)=>{
  const {exchange}=getQuery<z.infer<typeof ExchangeQuery>>(req);
  const symbol=String(req.params.symbol).toUpperCase();
  if(!/^[A-Z0-9.\-]{1,20}$/.test(symbol))throw new ApiError(400,"Invalid stock symbol");
  res.json({data:await getEngineBundle(symbol,exchange)});
}));
