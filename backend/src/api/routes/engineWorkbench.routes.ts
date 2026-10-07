import { Router } from "express";
import type { Request,Response } from "express";
import { z } from "zod";
import { ACTIVE_EXCHANGES,env } from "../../config/index.js";
import { requireSubscriber, requireEngineUser } from "../middleware/requireSubscriber.js";
import { asyncHandler,ApiError } from "../middleware/errorHandler.js";
import { engineRepository } from "../../storage/repositories/engineRepository.js";
import { EnginePreferencesSchema } from "../../services/research/enginePreferences.js";
import { getEngineBundle } from "../../services/research/engineBundle.js";
import { getPortfolioOverview,getPortfolioResearch,getPeers } from "../../services/research/engineWorkspace.js";
import { askEngine,type Evidence } from "../../services/research/engineAssistant.js";
import { query } from "../../storage/db.js";
import { monitoringKinds } from "../../services/research/engineMonitoring.js";
import { runEngineMonitoringOnce } from "../../workers/engineMonitorWorker.js";
export const engineWorkbenchRoutes=Router();
const exchangeSchema=z.enum(ACTIVE_EXCHANGES).default("NSE");
const symbolSchema=z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,20}$/);
const user=(res:Response)=>String(res.locals.engineUserId);
const handle=(fn:(req:Request,res:Response)=>Promise<void>)=>asyncHandler(async(req,res)=>{try{await fn(req,res);}catch(error){if((error as {code?:string}).code==="42P01")throw new ApiError(503,"Engine persistence requires the latest database migration. Ask the administrator to deploy it.");throw error;}});
const parse=<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>=>{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,"Invalid Engine request: "+result.error.issues.map(i=>i.message).join(", "));return result.data;};
engineWorkbenchRoutes.get("/engine/preferences",requireSubscriber,handle(async(_req,res)=>{res.json({data:await engineRepository.preferences(user(res))});}));
engineWorkbenchRoutes.post("/engine/preferences",requireSubscriber,handle(async(req,res)=>{const settings=parse(EnginePreferencesSchema,req.body);res.json({data:await engineRepository.savePreferences(user(res),settings)});}));
engineWorkbenchRoutes.post("/engine/interests",requireSubscriber,handle(async(req,res)=>{
  const body=parse(z.object({symbol:symbolSchema,exchange:exchangeSchema,reset:z.boolean().optional()}),req.body);
  const preferences=await engineRepository.preferences(user(res));
  if(body.reset)preferences.interests=[];
  else if(preferences.learnInterests){const current=preferences.interests.find(i=>i.symbol===body.symbol&&i.exchange===body.exchange);if(current)current.visits=Math.min(current.visits+1,10000);else preferences.interests.unshift({symbol:body.symbol,exchange:body.exchange,visits:1});preferences.interests=preferences.interests.slice(0,30);}
  res.json({data:await engineRepository.savePreferences(user(res),preferences)});
}));
engineWorkbenchRoutes.get("/engine/portfolio",requireSubscriber,handle(async(req,res)=>{res.json({data:await getPortfolioResearch(user(res),parse(exchangeSchema,req.query.exchange))});}));
engineWorkbenchRoutes.get("/engine/portfolio/overview",requireEngineUser,handle(async(req,res)=>{res.json({data:await getPortfolioOverview(user(res),parse(exchangeSchema,req.query.exchange))});}));
engineWorkbenchRoutes.post("/engine/cash-flows",requireSubscriber,handle(async(req,res)=>{
  const b=parse(z.object({exchange:exchangeSchema,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v<=new Date().toISOString().slice(0,10)),amount:z.number().finite().min(-1e12).max(1e12).refine(n=>n!==0),note:z.string().max(160).default("")}),req.body);
  const id=(await query("INSERT INTO public.engine_cash_flows(user_id,exchange,session_date,amount,note) VALUES($1,$2,$3,$4,$5) RETURNING id",[user(res),b.exchange,b.date,b.amount,b.note])).rows[0];res.json({data:id});
}));
engineWorkbenchRoutes.delete("/engine/cash-flows/:id",requireSubscriber,handle(async(req,res)=>{const id=parse(z.string().uuid(),req.params.id);await query("DELETE FROM public.engine_cash_flows WHERE id=$1 AND user_id=$2",[id,user(res)]);res.json({data:{deleted:true}});}));
engineWorkbenchRoutes.get("/engine/peers",requireSubscriber,handle(async(req,res)=>{res.json({data:await getPeers(parse(symbolSchema,req.query.symbol),parse(exchangeSchema,req.query.exchange))});}));
engineWorkbenchRoutes.get("/engine/monitoring",requireSubscriber,handle(async(_req,res)=>{res.json({data:await engineRepository.rules(user(res))});}));
engineWorkbenchRoutes.post("/engine/monitoring",requireSubscriber,handle(async(req,res)=>{
  const rule=parse(z.object({exchange:exchangeSchema,symbol:symbolSchema,kind:z.enum(monitoringKinds),threshold:z.number().finite().min(-1e9).max(1e9).optional(),enabled:z.boolean().default(true)}).refine(v=>v.kind==="material_change"||v.threshold!=null,"A numeric threshold is required"),req.body);
  const count=await engineRepository.rules(user(res));if(count.length>=50&&!count.some(r=>r.symbol===rule.symbol&&r.kind===rule.kind&&r.exchange===rule.exchange))throw new ApiError(400,"Maximum 50 Engine monitoring rules per account.");
  res.json({data:await engineRepository.saveRule(user(res),rule)});
}));
engineWorkbenchRoutes.delete("/engine/monitoring/:id",requireSubscriber,handle(async(req,res)=>{await engineRepository.deleteRule(user(res),parse(z.string().uuid(),req.params.id));res.json({data:{deleted:true}});}));
engineWorkbenchRoutes.post("/engine/monitoring/check",requireSubscriber,handle(async(req,res)=>{const body=parse(z.object({symbol:symbolSchema,exchange:exchangeSchema}),req.body);await runEngineMonitoringOnce(user(res),body.symbol,body.exchange);res.json({data:await engineRepository.rules(user(res))});}));
engineWorkbenchRoutes.get("/engine/monitoring/activity",requireSubscriber,handle(async(_req,res)=>{res.json({data:(await query("SELECT id,title,message,created_at FROM public.notifications WHERE user_id=$1 AND type='engine' ORDER BY created_at DESC LIMIT 20",[user(res)])).rows});}));
engineWorkbenchRoutes.get("/engine/usage",requireSubscriber,handle(async(_req,res)=>{res.json({data:{...await engineRepository.aiUsage(user(res)),monthlyApplicationCap:env.ENGINE_AI_MONTHLY_BUDGET_USD,dailyUserLimit:env.ENGINE_AI_USER_DAILY_LIMIT,model:"gpt-5.4-mini",configured:!!env.OPENAI_API_KEY}});}));
engineWorkbenchRoutes.post("/engine/assistant",requireSubscriber,handle(async(req,res)=>{
  const body=parse(z.object({question:z.string().trim().min(3).max(2000),symbols:z.array(symbolSchema).min(1).max(3),exchange:exchangeSchema,scope:z.enum(["company","portfolio"]).default("company")}),req.body);
  const preferences=await engineRepository.preferences(user(res));
  const evidence:Evidence[]=[];
  if(body.scope==="portfolio"){
    const portfolio=await getPortfolioResearch(user(res),body.exchange);
    evidence.push({id:"portfolio",title:"Your portfolio research",asOf:new Date().toISOString(),url:null,facts:{positions:portfolio.positions,sectors:portfolio.sectors,warnings:portfolio.warnings,performance:portfolio.performance,correlations:portfolio.correlations,risk:portfolio.risk,dividends:portfolio.dividends,researchBriefing:portfolio.researchBriefing,coverage:portfolio.coverage,methodology:portfolio.methodology}});
  }else for(const symbol of [...new Set(body.symbols)]){
    const data=await getEngineBundle(symbol,body.exchange);
    evidence.push({id:symbol+":company",title:data.companyName+" financial analysis",asOf:data.quality.filedAt,url:null,facts:{briefing:data.briefing,quality:data.quality,financial:data.financialAnalysis,valuation:data.valuation?.models,scenarios:data.scenarios,missing:data.unavailable}});
    evidence.push({id:symbol+":technical",title:symbol+" dated technical observations",asOf:data.quote?.timestamp??null,url:null,facts:data.synthesis});
    for(const n of data.news.slice(0,4))evidence.push({id:symbol+":news:"+n.id,title:n.headline,asOf:n.publishedAt,url:/^https?:\/\//i.test(n.url)?n.url:null,facts:{summary:n.summary,methodology:n.methodology}});
  }
  res.json({data:await askEngine(user(res),body.question,evidence,preferences)});
}));
