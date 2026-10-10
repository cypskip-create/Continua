import { PremiumDetail } from "@/components/engine/PremiumDetail";
import { EstimateAudit } from "./EstimateAudit";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { historicalApi } from "@/api/historicalApi";
import type { StockEarningsEvent } from "@/api/types";
import { financialNumber, financialPeriod } from "@/lib/financialPresentation";

import { financialTab } from "./FinancialStatementExplorer";

export function ForecastDetail({symbol,currency,events}: {symbol:string;currency:string;events:StockEarningsEvent[]}) {
  const estimates=events.filter(e=>e.revenueEstimate!=null||e.epsEstimate!=null);
  return <section className="border-t border-border py-4 space-y-3"><h3 className="text-lg font-semibold">Forecasts & analyst coverage</h3><p className="text-sm">${estimates.length} releases with sourced revenue or EPS estimates.</p><p className="text-xs text-muted-foreground">Basic estimates remain free. Premium adds coverage audits, reported estimate differences and price-history context.</p><PremiumDetail title="Forecasts & analyst coverage" symbol={symbol} currency={currency}><ForecastResearchWorkbench symbol={symbol} currency={currency} events={events}/></PremiumDetail></section>;
}
function ForecastResearchWorkbench({symbol,currency,events}: {symbol:string;currency:string;events:StockEarningsEvent[]}) {
  const [tab,setTab]=useState("Financial estimates"),[filter,setFilter]=useState("All");
  const estimates=events.filter(e=>e.revenueEstimate!=null||e.epsEstimate!=null).sort((a,b)=>a.fiscalYear-b.fiscalYear||(a.fiscalQuarter??0)-(b.fiscalQuarter??0));
  const {data:candles=[]}=useQuery({queryKey:["continua","candles",symbol,"forecast-detail"],queryFn:()=>historicalApi.getCandles(symbol,{from:new Date(Date.now()-365*86_400_000).toISOString().slice(0,10)}),enabled:tab==="Price targets",staleTime:15*60_000,retry:1});
  return <div aria-label="Premium analyst coverage workbench">
    <EstimateAudit events={events} currency={currency}/>
    <div className="flex gap-1 overflow-x-auto py-2 border-b border-border" role="tablist" aria-label="Forecast detail category">{["Financial estimates","Price targets","Consensus ratings"].map(t=><button key={t} role="tab" aria-selected={tab===t} className={financialTab(tab===t)} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==="Financial estimates"&&<><h3 className="text-lg font-semibold py-3">Reported and estimated financials</h3><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm"><thead><tr><th className="text-left p-2">Period</th><th className="text-right p-2">Revenue actual</th><th className="text-right p-2">Revenue estimate</th><th className="text-right p-2">EPS actual</th><th className="text-right p-2">EPS estimate</th></tr></thead><tbody>{estimates.map(e=><tr key={e.id} className="border-t border-border"><th className="text-left font-normal p-2">{financialPeriod(e)}</th><td className="text-right p-2">{financialNumber(e.revenueActual)}</td><td className="text-right p-2">{financialNumber(e.revenueEstimate)}</td><td className="text-right p-2">{e.epsActual==null?"—":Number(e.epsActual).toFixed(2)}</td><td className="text-right p-2">{e.epsEstimate==null?"—":Number(e.epsEstimate).toFixed(2)}</td></tr>)}</tbody></table></div>{!estimates.length&&<p className="text-sm text-muted-foreground py-3">No sourced estimate records. A scenario calculation is not substituted for consensus.</p>}</>}
    {tab==="Price targets"&&<><h3 className="text-lg font-semibold py-3">Price history & target coverage</h3>{candles.length>1&&<div className="h-56" role="img" aria-label="Historical prices without analyst forecast"><ResponsiveContainer width="100%" height="100%"><LineChart data={[...candles].sort((a,b)=>a.timestamp.localeCompare(b.timestamp))}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4"/><XAxis dataKey="timestamp" tickFormatter={v=>String(v).slice(0,10)} minTickGap={55} tick={{fontSize:"0.625rem"}}/><YAxis domain={["auto","auto"]} width={50} tick={{fontSize:"0.625rem"}}/><Tooltip formatter={(v:number)=>financialNumber(v,currency)} contentStyle={{background:"hsl(var(--popover))",color:"hsl(var(--popover-foreground))",border:"1px solid hsl(var(--border))"}}/><Line dataKey="close" name="Historical close" stroke="#4f7cf5" dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>}<p className="text-sm text-muted-foreground py-3">No verified 12-month analyst targets or analyst count are supplied. No min/average/max forecast cone is drawn.</p></>}
    {tab==="Consensus ratings"&&<><h3 className="text-lg font-semibold py-3">Consensus rating</h3><div role="tablist" aria-label="Analyst rating filter" className="flex gap-1">{["All","Buy","Hold","Sell"].map(f=><button key={f} role="tab" aria-selected={filter===f} className={financialTab(filter===f)} onClick={()=>setFilter(f)}>{f}</button>)}</div><p className="text-sm text-muted-foreground py-3">No verified {filter==="All"?"analyst":filter.toLowerCase()} ratings are available. Analyst names, success rates and consensus percentages require a sourced ratings feed.</p></>}
    <Link to={`/engine?symbol=${encodeURIComponent(symbol)}`} className="block border-t border-border py-3 text-primary text-sm font-semibold">Review sourced company evidence in Engine →</Link>
  </div>;
}
