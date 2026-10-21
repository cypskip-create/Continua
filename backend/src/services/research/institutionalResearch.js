import {LRUCache} from 'lru-cache';
import {createHash} from 'node:crypto';
import {query} from '../../storage/db.js';
import {calculateInvestment} from './investmentResearch.js';
import {riskHistory} from './stockRisk.js';
import {getPortfolioResearch} from './engineWorkspace.js';
import {ApiError} from '../../api/middleware/errorHandler.js';

export const institutionalVersion='institutional-intelligence-v1';
export const institutionalKinds=['probabilistic-forecast','monte-carlo','liquidity','exposure-graph','research-case','relationship-draft','portfolio-liquidity'];
const active=new Set();
const results=new LRUCache({max:32,maxSize:8*1024*1024,sizeCalculation:v=>Buffer.byteLength(JSON.stringify(v)),ttl:30000});
/** One expensive request per verified owner, plus existing global worker admission. */
export async function ownedCalculation(owner,input,origin='caller-provided evidence, not independently authenticated'){
 if(active.has(owner))throw new ApiError(429,'An institutional calculation is already running for this account.');
 active.add(owner);const start=Date.now();let output,status='success';
 const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 try{
  const models=await query('SELECT status FROM market.quantitative_models WHERE id=$1 AND version=$2',[input.kind,institutionalVersion]);
  if(!models.rows.length||models.rows[0].status==='disabled')throw new ApiError(503,'Model unavailable or awaiting the explicit governance migration.');
  const dependency=input.kind==='monte-carlo'&&input.method==='factor-bootstrap'?'factor-model':input.kind==='portfolio-liquidity'&&input.optimization?'optimization':null;
  if(dependency){const dependencyModel=(await query("SELECT status FROM market.quantitative_models WHERE id=$1 AND version='investment-intelligence-v1'",[dependency])).rows[0];if(!dependencyModel||dependencyModel.status==='disabled')throw new ApiError(503,'Dependent model unavailable or disabled.');}
  const cacheKey=createHash('sha256').update(JSON.stringify([institutionalVersion,owner,input])).digest('hex');
  output=results.get(cacheKey);if(!output){const calculated=await calculateInvestment(input);if(!/^[a-f0-9]{64}$/.test(calculated.governance?.inputHash??''))throw new ApiError(503,'Model evidence envelope unavailable.');output=calculated;results.set(cacheKey,output);}output.governance.inputOrigin=origin;return output;
 }catch(error){status=error.status===422?'input-validation':'worker-unavailable';throw error;}
 finally{
  active.delete(owner);
  const summary=output?{available:output.available??true,validationStatus:output.validation?.status??'hypothetical-or-descriptive',observations:output.observations??output.diagnostics?.observations??null,coverage:output.validation?.comparisons?.map(c=>({method:c.method,origins:c.origins,coverage:c.coverage,mae:c.mae,bias:c.bias,auditOrigins:c.auditOrigins,auditCoverage:c.auditCoverage,auditMAE:c.auditMAE,auditBias:c.auditBias})),numericalReconciliation:output.tailReconciliationError??null}:{};
  // Operations failures stay visible, but an audit-store outage cannot fabricate a model result.
  try{await query('SELECT market.record_quantitative_run($1,$2,$3,$4,$5,$6::jsonb,$7)',[owner,input.kind,institutionalVersion,output?.governance?.inputHash??fingerprint,status,JSON.stringify(summary),Date.now()-start]);if(output)output.governance.recorded=true;}
  catch{if(output)output.governance.recorded=false;}
 }
}
export async function companyMarket(symbol,lookbackDays=2200,quoteAsOf=new Date().toISOString().slice(0,10)){
 const row=(await query("SELECT symbol,currency,status FROM market.securities WHERE exchange='NSE' AND symbol=$1",[symbol])).rows[0];
 if(!row)throw new ApiError(404,'Unknown NSE security.');
 const history=await riskHistory('NSE:'+symbol,quoteAsOf,lookbackDays);
 const sourceUrls=[...new Set(history.bars.map(bar=>bar.sourceUrl).filter(Boolean))];
 return {...row,bars:history.bars.slice(-1501).map(bar=>({date:(bar.timestamp instanceof Date?bar.timestamp.toISOString():String(bar.timestamp)).slice(0,10),close:bar.close,volume:bar.volume,sourceIndex:sourceUrls.indexOf(bar.sourceUrl)})),sourceUrls,actions:history.actions};
}
export async function preparedCompany(symbol,mode,options={}){
 const asset=await companyMarket(symbol);
 return calculateInvestment({kind:'institutional-inputs',mode,asOf:new Date().toISOString().slice(0,10),assets:[asset],options});
}
export async function ownedSimulation(owner,options){
 const portfolio=await getPortfolioResearch(owner,'NSE'),risk=portfolio.riskIntelligence;
 if(!risk?.covariance||!risk.symbols?.length||risk.coverage.some(c=>!c.included)||risk.overview.coveredValue!==risk.overview.riskCoveredValue)throw new ApiError(422,'Every owned holding requires eligible aligned source history. Review Risk Intelligence coverage.');
 const assets=[];
 // Sequential bounded reads reuse the existing source-policy cache and two-connection DB pool.
 for(let i=0;i<risk.symbols.length;i++)assets.push({...await companyMarket(risk.symbols[i],365,risk.overview.positions.find(p=>p.symbol===risk.symbols[i])?.asOf),weight:risk.weights[i]});
 const configuration=await calculateInvestment({kind:'institutional-inputs',mode:'simulation',asOf:new Date().toISOString().slice(0,10),assets,capital:risk.overview.coveredValue,portfolioSnapshot:risk.evidence,options});
 return {configuration,result:await ownedCalculation(owner,configuration,'server-owned holdings and canonical market evidence')};
}
export async function exposureEdges(asOf,symbol){
 const rows=(await query('SELECT payload FROM market.institutional_graph_rows($1::date,$2) payload',[asOf,symbol??null])).rows.map(r=>r.payload);
 if(rows.length>500)throw new ApiError(422,'Select a smaller company neighborhood; the exposure map is limited to 500 edges.');
 return rows;
}

export async function ownedLiquidity(owner,options){
 const holdings=(await query('SELECT upper(symbol) AS symbol,sum(shares)::float8 AS quantity FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0 ORDER BY upper(symbol)',[owner])).rows;
 if(!holdings.length||holdings.length>70)throw new ApiError(422,'Liquidity research requires 1–70 owned positive positions.');
 const assets=[];for(const holding of holdings){const market=await companyMarket(holding.symbol,365);assets.push({...market,bars:market.bars.slice(-120),quantity:holding.quantity});}
 const configuration={kind:'portfolio-liquidity',asOf:new Date().toISOString().slice(0,10),assets,participation:options.participation,liquidationSessions:options.liquidationSessions,minimumTradingFrequency:options.minimumTradingFrequency};
 if(options.optimize){
  const portfolio=await getPortfolioResearch(owner,'NSE'),risk=portfolio.riskIntelligence;
  if(!risk?.covariance||risk.coverage.some(c=>!c.included)||risk.overview.coveredValue!==risk.overview.riskCoveredValue)throw new ApiError(422,'Every holding requires aligned eligible risk history for optimization.');
  configuration.optimization={kind:'optimization',objective:options.objective,turnoverCap:options.turnoverCap,symbols:risk.symbols,currentWeights:risk.weights,covariance:risk.covariance,observations:risk.evidence.observations,sourceEvidence:risk.evidence,sectors:Object.fromEntries(risk.overview.positions.map(p=>[p.symbol,p.sector]))};
 }
 return {configuration,result:await ownedCalculation(owner,configuration,'server-owned holdings and canonical market evidence')};
}
