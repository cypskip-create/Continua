import type { Candle, FinancialHistoryEntry, StockEarningsEvent } from "../api/types";
import { annualizedVolatility } from "./portfolioMetrics.ts";

const valid=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
export function priceRiskResearch(candles:Candle[]) {
  const byDate=new Map<string,Candle>();
  for(const c of candles)if(valid(c.close)&&c.close>0&&Number.isFinite(Date.parse(c.timestamp)))byDate.set(c.timestamp.slice(0,10),c);
  const rows=[...byDate.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  let peak=0,peakDate="",worst=0,worstPeak="",trough="",gaps=0;
  const returns:number[]=[];
  const points=rows.map((c,i)=>{
    const date=c.timestamp.slice(0,10);
    if(c.close>=peak){peak=c.close;peakDate=date;}
    const drawdown=(c.close/peak-1)*100;
    if(drawdown<worst){worst=drawdown;worstPeak=peakDate;trough=date;}
    if(i){const gap=(Date.parse(c.timestamp)-Date.parse(rows[i-1].timestamp))/86400000;if(gap>7)gaps++;else returns.push(c.close/rows[i-1].close-1);}
    return {date,close:c.close,drawdown,volatility20:returns.length>=20?annualizedVolatility(returns.slice(-20)):null};
  });
  const peakClose=rows.find(c=>c.timestamp.slice(0,10)===worstPeak)?.close;
  const recovery=trough&&peakClose?(rows.find(c=>c.timestamp.slice(0,10)>trough&&c.close>=peakClose)?.timestamp.slice(0,10)??null):null;
  return {points,returns,gaps,excluded:candles.length-rows.length,volatility:returns.length>=20?annualizedVolatility(returns):null,worst:points.length>1?worst:null,worstPeak,trough,recovery,current:points.length>1?points.at(-1)!.drawdown:null,lossFrequency:returns.length?returns.filter(r=>r<0).length/returns.length*100:null,worstReturn:returns.length?Math.min(...returns)*100:null};
}
export function growthResearch(history:FinancialHistoryEntry[],metric:"revenue"|"netIncome"|"eps") {
  const byYear=new Map<number,FinancialHistoryEntry>();
  for(const r of history)if(!r.fiscalQuarter&&valid(r[metric]))byYear.set(r.fiscalYear,r);
  const rows=[...byYear.values()].sort((a,b)=>a.fiscalYear-b.fiscalYear);
  const points=rows.map(r=>{const prior=byYear.get(r.fiscalYear-1);return {year:r.fiscalYear,value:r[metric],yoy:prior&&prior[metric]!==0?(r[metric]-prior[metric])/Math.abs(prior[metric])*100:null,margin:valid(r.revenue)&&r.revenue>0&&valid(r.netIncome)?r.netIncome/r.revenue*100:null,cashConversion:valid(r.operatingCashFlow)&&r.netIncome>0?r.operatingCashFlow/r.netIncome:null};});
  const first=rows[0],last=rows.at(-1),years=first&&last?last.fiscalYear-first.fiscalYear:0;
  const currencies=new Set(rows.map(r=>r.currency).filter(Boolean));
  const cagr=years>0&&first[metric]>0&&last![metric]>0&&currencies.size<=1?((last![metric]/first[metric])**(1/years)-1)*100:null;
  return {points,cagr,years,mixedCurrency:currencies.size>1};
}
export function estimateResearch(events:StockEarningsEvent[],metric:"revenue"|"eps") {
  const rows=events.map(e=>{const actual=metric==="eps"?e.epsActual:e.revenueActual,estimate=metric==="eps"?e.epsEstimate:e.revenueEstimate;return {event:e,actual,estimate,error:valid(actual)&&valid(estimate)&&estimate!==0?(actual-estimate)/Math.abs(estimate)*100:null};});
  const errors=rows.map(r=>r.error).filter(valid);
  return {rows,covered:errors.length,meanAbsoluteError:errors.length?errors.reduce((s,v)=>s+Math.abs(v),0)/errors.length:null,bias:errors.length?errors.reduce((s,v)=>s+v,0)/errors.length:null};
}
export function financialScenario(base:number|null,growth:number,years:number,margin:number) {
  if(!valid(base)||base<=0)return [];
  const g=Math.max(-50,Math.min(50,growth)),h=Math.max(1,Math.min(10,Math.round(years))),m=Math.max(-100,Math.min(100,margin));
  return Array.from({length:h+1},(_,year)=>({year,revenue:base*(1+g/100)**year,earnings:base*(1+g/100)**year*m/100}));
}

/** Release timing is unknown: last prior close to Nth subsequent close, not causal. */
export function releaseWindowResearch(events:StockEarningsEvent[],candles:Candle[],sessions:number) {
  const rows=priceRiskResearch(candles).points;
  const n=Math.max(1,Math.min(5,Math.round(sessions)));
  return [...events].filter(e=>e.reportedDate).sort((a,b)=>a.reportedDate!.localeCompare(b.reportedDate!)).map(event=>{
    const date=event.reportedDate!.slice(0,10),before=rows.filter(c=>c.date<date).at(-1),after=rows.filter(c=>c.date>date)[n-1];
    const beforeGap=before?(Date.parse(date)-Date.parse(before.date))/86400000:Infinity;
    const afterGap=after?(Date.parse(after.date)-Date.parse(date))/86400000:Infinity;
    return {event,from:before?.date,to:after?.date,move:before&&after&&beforeGap<=7&&afterGap<=14?(after.close/before.close-1)*100:null};
  });
}
