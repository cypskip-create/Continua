import { finite } from "./engineAnalytics.js";
export interface PricedPosition {symbol:string;sector:string;shares:number;price:number|null;change:number|null;volume:number|null;currency:string;asOf:string|null}
export function portfolioAnalysis(positions: PricedPosition[]) {
  const priced=positions.filter(p=>finite(p.price)&&p.price>0&&finite(p.shares)&&p.shares>0);
  const currencyGroups=[...new Set(priced.map(p=>p.currency))];
  if(currencyGroups.length>1)return {available:false,reason:"Mixed currencies cannot be aggregated without dated FX rates.",positions:[],sectors:[],totalValue:0,sessionPnl:null,coverage:`${priced.length}/${positions.length}`,warnings:["Currency conversion feed required."]};
  const total=priced.reduce((s,p)=>s+p.shares*p.price!,0);
  const rows=priced.map(p=>({...p,value:p.shares*p.price!,weight:total>0?p.shares*p.price!/total:0,sessionContribution:finite(p.change)?p.shares*p.change:null,participation:finite(p.volume)&&p.volume>0?p.shares/p.volume:null})).sort((a,b)=>b.value-a.value);
  const sectors = new Map<string,number>();rows.forEach(p=>sectors.set(p.sector,(sectors.get(p.sector)??0)+p.value));
  const warnings:string[]=[];
  if(rows.some(p=>p.weight>0.4))warnings.push("A priced position exceeds 40% of covered portfolio value.");
  if(rows.some(p=>p.participation!=null&&p.participation>0.1))warnings.push("A holding exceeds 10% of its latest session volume. This is a rough liquidity observation, not a liquidation forecast.");
  if(priced.length!==positions.length)warnings.push("Unpriced holdings are excluded; weights and contributions describe covered positions only.");
  return {available:true,reason:null,positions:rows,sectors:[...sectors].map(([sector,value])=>({sector,value,weight:total?value/total:0})),totalValue:total,sessionPnl:rows.length && rows.every(p=>p.sessionContribution!=null)?rows.reduce((s,p)=>s+p.sessionContribution!,0):null,coverage:`${priced.length}/${positions.length}`,warnings};
}
export interface PerformancePoint {date:string;value:number;flow:number}
export function performance(points:PerformancePoint[],datedFlows?:{date:string;amount:number}[]) {
  const ordered=[...points].sort((a,b)=>a.date.localeCompare(b.date));
  if(ordered.length<2)return {twr:null,moneyWeighted:null,reason:"At least two complete dated valuation snapshots are needed."};
  let product=1;
  for(let i=1;i<ordered.length;i++){const before=ordered[i-1]!,after=ordered[i]!;if(before.value<=0||!finite(after.value)||!finite(after.flow))return {twr:null,moneyWeighted:null,reason:"Invalid valuation or flow coverage."};product*=(after.value-after.flow)/before.value;}
  const start=ordered[0]!,end=ordered[ordered.length-1]!;
  const external=datedFlows?datedFlows.filter(f=>f.date>start.date&&f.date<=end.date).map(f=>({date:f.date,amount:-f.amount})):ordered.slice(1).filter(p=>p.flow!==0).map(p=>({date:p.date,amount:-p.flow}));
  const cash=[{date:start.date,amount:-start.value},...external,{date:end.date,amount:end.value}];
  const base=Date.parse(start.date),years=(Date.parse(end.date)-base)/(365.25*86400000);
  const npv=(rate:number)=>cash.reduce((sum,c)=>sum+c.amount/Math.pow(1+rate,(Date.parse(c.date)-base)/(365.25*86400000)),0);
  let lo=-0.9999,hi=10,weighted:number|null=null;
  if(years>0 && finite(npv(lo)) && finite(npv(hi)) && npv(lo)*npv(hi)<0){for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(npv(lo)*npv(mid)<=0)hi=mid;else lo=mid;}weighted=(lo+hi)/2;}
  return {twr:(product-1)*100,moneyWeighted:weighted==null?null:weighted*100,reason:"End-of-period external-flow convention. Money-weighted return is annualized; snapshots exclude unrecorded cash and dividends."};
}
export function alignedReturns(series:Record<string,{timestamp:string;close:number}[]>) {
  const maps=Object.fromEntries(Object.entries(series).map(([symbol,bars])=>[symbol,new Map(bars.filter(b=>finite(b.close)&&b.close>0).map(b=>[b.timestamp.slice(0,10),b.close]))]));
  const symbols=Object.keys(maps),first=symbols[0];
  const dates=first?[...maps[first]!.keys()].filter(d=>symbols.every(s=>maps[s]!.has(d))).sort():[];
  const returns=Object.fromEntries(symbols.map(s=>[s,dates.slice(1).map((date,i)=>maps[s]!.get(date)!/maps[s]!.get(dates[i]!)!-1)]));
  const pairs:{a:string;b:string;correlation:number|null}[]=[];
  for(let i=0;i<symbols.length;i++)for(let j=i+1;j<symbols.length;j++){const a=symbols[i]!,b=symbols[j]!,x=returns[a]!,y=returns[b]!,n=x.length;
    const mx=n?x.reduce((s,v)=>s+v,0)/n:0,my=n?y.reduce((s,v)=>s+v,0)/n:0;
    const cov=x.reduce((s,v,k)=>s+(v-mx)*(y[k]!-my),0),den=Math.sqrt(x.reduce((s,v)=>s+(v-mx)**2,0)*y.reduce((s,v)=>s+(v-my)**2,0));
    pairs.push({a,b,correlation:n>=20&&den>0?cov/den:null});}
  return {dates,pairs,methodology:"Pearson correlation using identical common trading-date intervals; at least 20 overlapping returns required."};
}
