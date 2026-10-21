import {Router} from 'express';
import {z} from 'zod';
import {requireEngineUser,requireSubscriber,requirePremiumPlus} from '../middleware/requireSubscriber.js';
import {asyncHandler,ApiError} from '../middleware/errorHandler.js';
import {query} from '../../storage/db.js';
import {CalendarDate} from '../../services/research/advancedResearch.js';
import {calculateInvestment} from '../../services/research/investmentResearch.js';
import {ownedCalculation,preparedCompany,ownedSimulation,ownedLiquidity,exposureEdges,institutionalKinds} from '../../services/research/institutionalResearch.js';

export const institutionalRoutes=Router();
const owner=res=>String(res.locals.engineUserId);
function parse(schema,value){const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'Invalid institutional research request.');return result.data;}
const symbol=z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,20}$/);
institutionalRoutes.use('/engine/institutional',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
function allowed(res,input){
 if(!institutionalKinds.includes(input.kind))throw new ApiError(400,'Unsupported institutional model.');
 if(res.locals.enginePlan==='premium_plus')return;
 if(res.locals.enginePlan!=='premium')throw new ApiError(403,'Detailed institutional research requires Premium.');
 if(input.kind==='liquidity'||input.kind==='research-case'&&!input.scenarios?.length||input.kind==='probabilistic-forecast'&&(input.target??'price-return')==='price-return'&&(input.frequency??'session')==='session'&&(input.horizon??5)<=20&&(input.method??'automatic')==='automatic')return;
 throw new ApiError(403,'This institutional model or advanced scenario requires Premium Plus.');
}
institutionalRoutes.get('/engine/institutional/profile/:symbol',requireSubscriber,asyncHandler(async(req,res)=>{
 const name=parse(symbol,req.params.symbol),financials=(await query("SELECT payload FROM market.canonical_financial_history($1,'annual',10,false) payload",['NSE:'+name])).rows.map(row=>row.payload);
 const configuration=await calculateInvestment({kind:'institutional-profile',asOf:new Date().toISOString().slice(0,10),symbol:name,financials});
 res.json({data:{configuration,result:await ownedCalculation(owner(res),configuration,'canonical company or permission-gated reviewed evidence')}});
}));
institutionalRoutes.get('/engine/institutional/models',requirePremiumPlus,asyncHandler(async(_req,res)=>{res.json({data:(await query('SELECT id,version,status,definition FROM market.quantitative_models ORDER BY id,version')).rows});}));
institutionalRoutes.get('/engine/institutional/liquidity/:symbol',requireEngineUser,asyncHandler(async(req,res)=>{
 const name=parse(symbol,req.params.symbol),configuration=await preparedCompany(name,'liquidity');
 const result=await ownedCalculation(owner(res),configuration,'canonical company or permission-gated reviewed evidence');
 if(!['premium','premium_plus'].includes(res.locals.enginePlan)){
  const row=result.windows.find(r=>r.window===20);res.json({data:{symbol:name,status:result.status,observationAgeDays:result.observationAgeDays,basic:true,windows:row?[{window:20,observations:row.observations,knownVolume:row.knownVolume,missingVolume:row.missingVolume,averageDailyVolume:row.averageDailyVolume,noTradeFraction:row.noTradeFraction}]:[],methodology:result.methodology}});return;
 }
 res.json({data:{...result,configuration}});
}));
institutionalRoutes.post('/engine/institutional/company/:symbol',requireSubscriber,asyncHandler(async(req,res)=>{
 const name=parse(symbol,req.params.symbol),input=parse(z.object({mode:z.enum(['forecast','liquidity']),options:z.record(z.unknown()).default({})}).strict(),req.body);
 const configuration=await preparedCompany(name,input.mode,input.options);allowed(res,configuration);
 res.json({data:{configuration,result:await ownedCalculation(owner(res),configuration,'canonical company or permission-gated reviewed evidence')}});
}));
institutionalRoutes.post('/engine/institutional/calculate',requireSubscriber,asyncHandler(async(req,res)=>{
 const input=parse(z.object({kind:z.enum(institutionalKinds),asOf:CalendarDate}).passthrough(),req.body);allowed(res,input);
 if(input.kind==='exposure-graph')throw new ApiError(400,'Use the source-verified graph endpoint; imported verification flags cannot establish factual relationships.');
 // Imported snapshots are caller evidence, not automatically published market records.
 res.json({data:await ownedCalculation(owner(res),input)});
}));
institutionalRoutes.post('/engine/institutional/owned-liquidity',requirePremiumPlus,asyncHandler(async(req,res)=>{
 const input=parse(z.object({participation:z.number().min(.001).max(.3),liquidationSessions:z.number().int().min(1).max(120),minimumTradingFrequency:z.number().min(0).max(1),optimize:z.boolean().default(false),objective:z.enum(['minimum-variance','risk-parity','maximum-diversification']).default('minimum-variance'),turnoverCap:z.number().min(0).max(1).default(.25)}).strict(),req.body);
 res.json({data:await ownedLiquidity(owner(res),input)});
}));
institutionalRoutes.post('/engine/institutional/owned-simulation',requirePremiumPlus,asyncHandler(async(req,res)=>{
 const input=parse(z.object({horizon:z.number().int().min(1).max(252),paths:z.number().int().min(200).max(5000),method:z.enum(['historical-bootstrap','block-bootstrap','normal-log-returns']),seed:z.number().int().min(0).max(4294967295),blockLength:z.number().int().min(1).max(60).optional(),costBps:z.number().min(0).max(1000),rebalance:z.enum(['none','daily','20-sessions']),confidence:z.number().min(.9).max(.99),lossThreshold:z.number().min(0).max(1),shocks:z.record(z.number().min(-.99).max(3)).optional(),inflationAnnual:z.number().min(-.5).max(5).optional(),sessionsPerYear:z.number().int().min(1).max(366).optional()}).strict(),req.body);
 res.json({data:await ownedSimulation(owner(res),input)});
}));
institutionalRoutes.post('/engine/institutional/graph',requirePremiumPlus,asyncHandler(async(req,res)=>{
 const input=parse(z.object({asOf:CalendarDate,symbol:symbol.optional(),start:z.string().max(200).optional(),end:z.string().max(200).optional(),propagation:z.object({origin:z.string().max(200),shock:z.number().min(-1).max(1),maxDepth:z.number().int().min(1).max(5),coefficients:z.record(z.number().min(0).max(1))}).strict().optional()}).strict(),req.body);
 const held=(await query('SELECT upper(symbol) AS symbol FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0',[owner(res)])).rows.map(row=>'security:NSE:'+row.symbol);
 const configuration={...input,kind:'exposure-graph',edges:await exposureEdges(input.asOf,input.symbol),portfolioSymbols:held};
 res.json({data:{configuration,result:await ownedCalculation(owner(res),configuration,'canonical company or permission-gated reviewed evidence')}});
}));
institutionalRoutes.get('/engine/institutional/snapshots',requireSubscriber,asyncHandler(async(_req,res)=>{res.json({data:(await query('SELECT input_hash AS "inputHash",name,created_at AS "createdAt" FROM market.quantitative_snapshots WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[owner(res)])).rows});}));
institutionalRoutes.post('/engine/institutional/snapshots',requireSubscriber,asyncHandler(async(req,res)=>{
 const input=parse(z.object({name:z.string().trim().min(1).max(100),configuration:z.object({kind:z.string(),asOf:CalendarDate}).passthrough()}).strict(),req.body);allowed(res,input.configuration);
 if(input.configuration.kind==='exposure-graph'){
  const config=input.configuration;const filter=parse(z.object({asOf:CalendarDate,symbol:symbol.optional()}),config);
  config.edges=await exposureEdges(filter.asOf,filter.symbol);
  config.portfolioSymbols=(await query('SELECT upper(symbol) AS symbol FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0',[owner(res)])).rows.map(row=>'security:NSE:'+row.symbol);
 }
 const result=await ownedCalculation(owner(res),input.configuration);
 const receipt=(await query('SELECT market.save_quantitative_snapshot($1,$2,$3,$4::jsonb,$5::jsonb) AS receipt',[owner(res),input.name,result.governance.inputHash,JSON.stringify(input.configuration),JSON.stringify(result)])).rows[0]?.receipt;
 if(!receipt)throw new ApiError(422,'Snapshot quota reached (10 per account) or snapshot exceeds one MiB. Export or remove an old snapshot.');
 res.status(201).json({data:receipt});
}));
for(const method of ['get','delete'])institutionalRoutes[method]('/engine/institutional/snapshots/:hash',requireSubscriber,asyncHandler(async(req,res)=>{
 const hash=parse(z.string().regex(/^[a-f0-9]{64}$/),req.params.hash);
 const rows=await query(method==='delete'?'SELECT market.delete_quantitative_snapshot($1,$2) AS receipt':'SELECT s.configuration||d.payload AS configuration,s.result,s.input_hash AS "inputHash",s.name,s.created_at AS "createdAt" FROM market.quantitative_snapshots s JOIN market.quantitative_datasets d ON d.user_id=s.user_id AND d.data_hash=s.data_hash WHERE s.user_id=$1 AND s.input_hash=$2',[owner(res),hash]);
 if(!rows.rows.length||method==='delete'&&!rows.rows[0].receipt)throw new ApiError(404,'Snapshot not found.');
 if(method==='get'){
  const config=rows.rows[0].configuration;allowed(res,config);
  if(config.kind==='exposure-graph'){
   const allowedIds=new Set((await exposureEdges(config.asOf,config.symbol)).map(e=>e.id));
   if(config.edges.some(edge=>!allowedIds.has(edge.id)))throw new ApiError(403,'Saved graph evidence is no longer eligible under the current source permission or date filters.');
  }
 }
 res.json({data:rows.rows[0]});
}));
