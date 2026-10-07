import { describe,it,expect } from "vitest";
import { analyzeFinancials,dataQuality,changesBetween,scenarios } from "../src/services/research/engineAnalytics.js";
import { portfolioAnalysis,performance,alignedReturns } from "../src/services/research/enginePortfolio.js";
import { evaluateMonitor } from "../src/services/research/engineMonitoring.js";
import { EnginePreferencesSchema } from "../src/services/research/enginePreferences.js";
import { simulateExecution } from "../src/services/technical/executionSimulation.js";
import type { Candle } from "../src/types/market.js";
describe("Engine financial quality",()=>{
  it("calculates growth only across consecutive years and leaves undefined ratios unknown",()=>{
    const analysis=analyzeFinancials([{fiscalYear:2024,revenue:100},{fiscalYear:2026,revenue:120,netIncome:-5,totalEquity:0,operatingCashFlow:10}],"Banking");
    expect(analysis.metrics.revenueGrowth).toBeNull();expect(analysis.metrics.cashConversion).toBeNull();expect(analysis.metrics.debtToEquity).toBeNull();expect(analysis.sectorNote).toContain("regulatory capital");
  });
  it("detects stale evidence and unbalanced statements without treating filing age as publication age",()=>{
    const quality=dataQuality({timestamp:"2026-09-01",source:"eod"},[{fiscalYear:2024,periodEnd:"2024-12-31",reportedAt:"2025-03-01",totalAssets:100,totalLiabilities:70,totalEquity:10}],new Date("2026-10-07"));
    expect(quality.warnings.some(w=>w.includes("seven"))).toBe(true);expect(quality.warnings.some(w=>w.includes("reconcile"))).toBe(true);expect(quality.filedAt).toBe("2025-03-01");
  });
  it("establishes an initial baseline and identifies revisions in the same filing year",()=>{
    const before={fiscalYear:2025,revenue:100,netIncome:10,debtToEquity:0.4,fairValue:50,newsIds:["a"],ownership:[]};
    expect(changesBetween(null,before).baseline).toBe(true);
    const after={...before,revenue:120,newsIds:["a","b"]};
    expect(changesBetween(before,after).changes.filter(c=>c.material)).toHaveLength(2);
  });
  it("keeps unavailable scenario inputs null and labels assumptions",()=>{
    const result=scenarios({fiscalYear:2025,revenue:100,netIncome:10});expect(result[0]?.revenue).toBe(90);expect(result[2]?.netIncome).toBe(11);expect(scenarios(undefined)[0]?.revenue).toBeNull();
  });
});
describe("Engine portfolio arithmetic",()=>{
  const position=(symbol:string,currency:string,price:number|null)=>({symbol,currency,price,shares:10,sector:"Banking",change:1,volume:10000,asOf:"2026-10-07"});
  it("does not aggregate money across currencies",()=>{expect(portfolioAnalysis([position("A","KES",100),position("B","USD",10)]).available).toBe(false);});
  it("does not sum different quote sessions as one daily portfolio change",()=>{const result=portfolioAnalysis([position("A","KES",100),{...position("B","KES",50),asOf:"2026-10-05"}]);expect(result.sessionPnl).toBeNull();expect(result.warnings.some(w=>w.includes("dated session"))).toBe(true);});
  it("discloses incomplete coverage and computes session contributions on covered holdings",()=>{const result=portfolioAnalysis([position("A","KES",100),position("B","KES",null)]);expect(result.sessionPnl).toBe(10);expect(result.coverage).toBe("1/2");expect(result.warnings).toContain("Unpriced holdings are excluded; weights and contributions describe covered positions only.");});
  it("removes end-of-period deposits from time-weighted returns",()=>{expect(performance([{date:"2025-01-01",value:100,flow:0},{date:"2026-01-01",value:160,flow:50}]).twr).toBeCloseTo(10);});
  it("requires overlapping dates rather than pairing different sessions by array index",()=>{
    const result=alignedReturns({A:[{timestamp:"2026-01-01",close:10},{timestamp:"2026-01-03",close:11}],B:[{timestamp:"2026-01-02",close:20},{timestamp:"2026-01-03",close:22}]});
    expect(result.dates).toEqual(["2026-01-03"]);expect(result.pairs[0]?.correlation).toBeNull();
  });
});
describe("Monitoring transitions and preferences",()=>{
  const state={price:40,debt:0.8,growth:10,fingerprint:"new",material:true,quoteFresh:true};
  it("notifies on crossing but remains quiet until the rule resets",()=>{
    const rule={kind:"price_below",threshold:50,last_state:null};expect(evaluateMonitor(rule,state).notify).toBe(true);expect(evaluateMonitor({...rule,last_state:{triggered:true}},state).notify).toBe(false);expect(evaluateMonitor(rule,{...state,quoteFresh:false}).notify).toBe(false);
  });
  it("does not announce an initial material-change baseline",()=>{expect(evaluateMonitor({kind:"material_change",threshold:null,last_state:null},state).notify).toBe(false);expect(evaluateMonitor({kind:"material_change",threshold:null,last_state:{fingerprint:"old"}},state).notify).toBe(true);});
  it("requires explicit consent to learn and rejects unexpected settings",()=>{expect(EnginePreferencesSchema.parse({}).learnInterests).toBe(false);expect(EnginePreferencesSchema.safeParse({subscription_plan:"premium"}).success).toBe(false);});
});
describe("Execution realism",()=>{
  const bar=(date:string,open:number,close:number,volume=1e6):Candle=>({securityId:"NSE:KCB",interval:"1d",timestamp:date,open,close,high:Math.max(open,close),low:Math.min(open,close),volume});
  it("executes after the signal bar and applies entry and exit costs",()=>{
    const bars=[bar("2026-01-01",10,10),bar("2026-01-02",20,22),bar("2026-01-03",30,30)];
    const result=simulateExecution(bars,["buy","sell","hold"],{feeBps:100,slippageBps:100,initialCapital:100,maxVolumeParticipation:0.01});
    expect(result.trades[0]?.entryDate).toBe("2026-01-02");expect(result.trades[0]?.entryPrice).toBeCloseTo(20.2);expect(result.totalReturnPercent).toBeLessThan(50);expect(result.openPosition).toBe(false);
  });
  it("rejects oversized orders against historical session volume",()=>{
    const result=simulateExecution([bar("2026-01-01",10,10),bar("2026-01-02",10,10,10)],["buy","hold"],{feeBps:0,slippageBps:0,initialCapital:1000,maxVolumeParticipation:0.01});expect(result.skipped).toBe(1);expect(result.totalReturnPercent).toBe(0);
  });
  it("marks an open position to market without fabricating an exit trade",()=>{
    const result=simulateExecution([bar("2026-01-01",10,10),bar("2026-01-02",10,12)],["buy","hold"],{feeBps:0,slippageBps:0,initialCapital:100,maxVolumeParticipation:0.01});expect(result.openPosition).toBe(true);expect(result.trades).toHaveLength(0);expect(result.totalReturnPercent).toBeCloseTo(20);
  });
});
