import { continuaFetch } from "./client";
export interface EnginePreferences {
  goal:string;horizon:string;experience:string;riskComfort:string;incomeNeeds:string;sectors:string[];
  notifications:boolean;learnInterests:boolean;interests:{symbol:string;exchange:string;visits:number}[];
}
export const defaultEnginePreferences:EnginePreferences={goal:"Balanced",horizon:"1_to_5_years",experience:"beginner",riskComfort:"unspecified",incomeNeeds:"none",sectors:[],notifications:true,learnInterests:false,interests:[]};
export interface MonitorRule {id:string;exchange:string;symbol:string;kind:string;threshold:number|null;enabled:boolean;last_state?:{checkedAt?:string;asOf?:string|null;value?:number|null;triggered?:boolean;unavailable?:boolean;error?:string}|null}
export interface AssistantAnswer {answer:string;citations:string[];limitations:string[];cached:boolean;sources:{id:string;title:string;asOf:string|null;url:string|null}[]}
export interface EnginePortfolio {
  snapshots?:{date:string;value:number;flow:number}[];
  risk?:{available:boolean;reason:string;symbols:string[];observations:number;coveredWeight:number;excludedIntervals:number;metrics:null|{portfolioVolatility:number;marketVolatility:number;portfolioMaxDrawdown:number;portfolioBeta:number|null;sharpe:null;sortino:null;volatilityByHolding:{symbol:string;volatility:number}[];drawdownByHolding:{symbol:string;drawdown:number}[]}};
  researchBriefing?:{covered:number;requested:number;limit:number;methodology:string;companies:{symbol:string;weight:number;period:number|null;metrics:Record<string,number|null>;findings:string[];sectorNote?:string|null;facts?:string[];risks:string[];qualityWarnings:string[];unavailable:string[];changes:{topic:string;text:string;material:boolean}[]}[];news:{id:string;symbol:string;headline:string;summary:string;url:string;publishedAt:string|null;source:string}[]};
  available:boolean;reason:string|null;totalValue:number;sessionPnl:number|null;coverage:string;currency:string|null;warnings:string[];methodology:string;historyWarnings:string[];
  positions:{symbol:string;sector:string;value:number;weight:number;sessionContribution:number|null;asOf:string|null}[];
  sectors:{sector:string;weight:number}[];
  correlations:{pairs:{a:string;b:string;correlation:number|null}[];methodology:string};
  performance:{twr:number|null;moneyWeighted:number|null;reason:string};
  dividends:{symbol:string;trailingIncome:number|null;upcoming:{date:string;amount:number}[]}[];
  flows:{id:string;date:string;amount:number;note:string}[];
}
export interface EnginePortfolioOverview {
  available:boolean;reason:string|null;exchange:string;currency:string|null;totalValue:number;totalCost:number|null;unrealized:number|null;sessionPnl:number|null;sessionDate:string|null;holdingCount:number;pricedCount:number;coverage:string;warnings:string[];methodology:string;generatedAt:string;
  positions:{symbol:string;value:number;weight:number;asOf:string|null}[];
}
export const engineWorkspaceApi={
  preferences:()=>continuaFetch<EnginePreferences>("/engine/preferences"),
  savePreferences:(settings:EnginePreferences)=>continuaFetch<EnginePreferences>("/engine/preferences",{method:"POST",body:settings}),
  visit:(symbol:string,exchange:string,reset=false)=>continuaFetch<EnginePreferences>("/engine/interests",{method:"POST",body:{symbol,exchange,reset}}),
  portfolio:(exchange:string)=>continuaFetch<EnginePortfolio>("/engine/portfolio",{params:{exchange}}),
  portfolioOverview:(exchange:string)=>continuaFetch<EnginePortfolioOverview>("/engine/portfolio/overview",{params:{exchange}}),
  peers:(symbol:string,exchange:string)=>continuaFetch<{symbol:string;name:string;period:number|null;metrics:Record<string,number|null>}[]>("/engine/peers",{params:{symbol,exchange}}),
  rules:()=>continuaFetch<MonitorRule[]>("/engine/monitoring"),
  checkRules:(symbol:string,exchange:string)=>continuaFetch<MonitorRule[]>("/engine/monitoring/check",{method:"POST",body:{symbol,exchange}}),
  monitorActivity:()=>continuaFetch<{id:string;title:string;message:string;created_at:string}[]>("/engine/monitoring/activity"),
  saveRule:(rule:Omit<MonitorRule,"id">)=>continuaFetch<MonitorRule>("/engine/monitoring",{method:"POST",body:{...rule,threshold:rule.threshold??undefined}}),
  deleteRule:(id:string)=>continuaFetch<{deleted:boolean}>(`/engine/monitoring/${encodeURIComponent(id)}`,{method:"DELETE"}),
  cashFlow:(exchange:string,date:string,amount:number,note:string)=>continuaFetch<{id:string}>("/engine/cash-flows",{method:"POST",body:{exchange,date,amount,note}}),
  deleteFlow:(id:string)=>continuaFetch<{deleted:boolean}>(`/engine/cash-flows/${encodeURIComponent(id)}`,{method:"DELETE"}),
  ask:(question:string,symbols:string[],exchange:string,scope:string)=>continuaFetch<AssistantAnswer>("/engine/assistant",{method:"POST",body:{question,symbols,exchange,scope}}),
  usage:()=>continuaFetch<{requests:number;reserved:number;monthlyApplicationCap:number;dailyUserLimit:number;model:string;configured:boolean}>("/engine/usage"),
};
