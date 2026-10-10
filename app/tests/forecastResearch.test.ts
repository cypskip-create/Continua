import test from "node:test";
import assert from "node:assert/strict";
import { priceRiskResearch, growthResearch, estimateResearch, financialScenario, releaseWindowResearch } from "../src/lib/forecastResearch.ts";
const candle=(date:string,close:number)=>({securityId:"NSE:KCB",interval:"1d" as const,timestamp:`${date}T00:00:00Z`,open:close,high:close,low:close,close,volume:100});
const filing=(fiscalYear:number,revenue:number,netIncome=10)=>({fiscalYear,revenue,netIncome,eps:1,currency:"KES" as const});
const event={id:"a",fiscalYear:2026,fiscalQuarter:1,expectedDate:null,reportedDate:"2026-01-05",epsEstimate:2,epsActual:3,revenueEstimate:100,revenueActual:110};
test("risk research sorts, deduplicates and preserves actual drawdown/recovery",()=>{
  const r=priceRiskResearch([candle("2026-01-06",110),candle("2026-01-01",100),candle("2026-01-02",80),candle("2026-01-02",80),candle("2026-01-03",0)]);
  assert.equal(r.points.length,3);assert.equal(r.excluded,2);assert.ok(Math.abs(r.worst!+20)<1e-9);assert.equal(r.worstPeak,"2026-01-01");assert.equal(r.trough,"2026-01-02");assert.equal(r.recovery,"2026-01-06");assert.equal(r.volatility,null);
});
test("long price gaps do not become daily returns and absent observations stay unavailable",()=>{
  const r=priceRiskResearch([candle("2026-01-01",100),candle("2026-02-01",60)]);assert.equal(r.gaps,1);assert.equal(r.returns.length,0);assert.equal(r.lossFrequency,null);assert.equal(r.recovery,null);
  assert.equal(priceRiskResearch([]).worst,null);
});
test("growth requires exact prior years for YoY and positive consistent-currency CAGR endpoints",()=>{
  const r=growthResearch([filing(2022,100),filing(2024,121),filing(2025,133.1)],"revenue");assert.equal(r.points[1].yoy,null);assert.ok(Math.abs(r.points[2].yoy!-10)<1e-9);assert.equal(r.years,3);
  assert.equal(growthResearch([filing(2022,-100),filing(2025,100)],"revenue").cagr,null);
  const mixed=[filing(2022,100),{...filing(2025,100),currency:"USD" as const}];assert.equal(growthResearch(mixed,"revenue").cagr,null);
});
test("estimate audit excludes missing and zero estimates; signed bias uses absolute denominator",()=>{
  const a=estimateResearch([event,{...event,id:"zero",epsEstimate:0},{...event,id:"missing",epsActual:null},{...event,id:"loss",epsEstimate:-2,epsActual:-1}],"eps");assert.equal(a.covered,2);assert.equal(a.bias,50);assert.equal(a.meanAbsoluteError,50);
});
test("scenario controls are bounded, anchors stay real and losses follow explicit margin assumptions",()=>{
  assert.deepEqual(financialScenario(null,5,3,10),[]);assert.deepEqual(financialScenario(-1,5,3,10),[]);
  const s=financialScenario(100,10,2,-20);assert.ok(Math.abs(s.at(-1)!.revenue-121)<1e-9);assert.ok(Math.abs(s.at(-1)!.earnings+24.2)<1e-9);assert.equal(financialScenario(100,500,50,200).length,11);
});
test("release windows require actual subsequent closes and bounded date gaps",()=>{
  const cs=[candle("2026-01-02",100),candle("2026-01-06",110),candle("2026-01-07",105),candle("2026-01-08",120)];assert.ok(Math.abs(releaseWindowResearch([event],cs,3)[0].move!-20)<1e-9);assert.equal(releaseWindowResearch([event],cs,5)[0].move,null);assert.equal(releaseWindowResearch([event],[candle("2025-12-01",100),...cs.slice(1)],1)[0].move,null);
});
