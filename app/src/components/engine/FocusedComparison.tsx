import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { engineApi } from "@/api/engineApi";
import { engineReadRetry } from "@/api/engineRetry";

const metrics = {revenueGrowth:"Revenue growth (%)",earningsGrowth:"Earnings growth (%)",cashConversion:"Operating cash / earnings (×)",debtToEquity:"Debt / equity (×)",currentRatio:"Current ratio (×)",returnOnAssets:"Return on assets (%)"};
export function FocusedComparison({symbol,exchange}:{symbol:string;exchange:string}) {
  const [peer,setPeer]=useState(symbol==="KCB"?"EQTY":"KCB"),[metric,setMetric]=useState<keyof typeof metrics>("revenueGrowth");
  const query=useQuery({queryKey:["continua","engine-focused",exchange,symbol,peer],queryFn:()=>Promise.all([engineApi.get(symbol,exchange),engineApi.get(peer,exchange)]),enabled:peer!==symbol&&/^[A-Z0-9.\-]{1,20}$/.test(peer),staleTime:60000,retry:engineReadRetry});
  const value=(d:NonNullable<typeof query.data>[number])=>{const n=d.financialAnalysis?.metrics[metric];return n==null?null:metric==="returnOnAssets"?n*100:n;};
  const values=query.data?.map(value);
  const comparable=query.data?.[0].currency===query.data?.[1].currency&&query.data?.[0].financialAnalysis?.period!=null&&query.data?.[0].financialAnalysis?.period===query.data?.[1].financialAnalysis?.period;
  return <section className="space-y-3 border-t border-border pt-3" aria-label="Focused comparison">
    <h3 className="text-base font-semibold">Compare one metric</h3>
    <div className="flex flex-wrap gap-2">
      <label className="text-xs">Compare {symbol} with<input aria-label="Focused comparison symbol" className="block border border-border bg-background px-3 py-2" value={peer} maxLength={20} onChange={e=>setPeer(e.target.value.trim().toUpperCase())}/></label>
      <label className="text-xs">Metric<select aria-label="Focused comparison metric" className="block border border-border bg-background px-3 py-2" value={metric} onChange={e=>setMetric(e.target.value as keyof typeof metrics)}>{Object.entries(metrics).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {peer===symbol&&<p className="text-xs">Choose a different company.</p>}
    {query.isFetching&&<p role="status" className="text-xs">Loading dated evidence…</p>}
    {query.error&&<p role="alert" className="text-xs text-bear">{query.error.message}</p>}
    {query.data&&peer!==symbol&&<>
      <div className="grid grid-cols-2 gap-3">{query.data.map(d=><div key={d.symbol} className="border-t border-border py-2"><strong className="text-sm">{d.symbol}</strong><p className="text-base">{value(d)?.toFixed(2)??"Unavailable"}</p><p className="text-xs text-muted-foreground">FY {d.financialAnalysis?.period??"unknown"} · {d.currency} · filed {d.quality?.filedAt??"unknown"}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">{comparable&&values?.every(v=>v!=null)?`${symbol} minus ${peer}: ${(values![0]!-values![1]!).toFixed(2)} ${metric.endsWith("Growth")||metric==="returnOnAssets"?"percentage points":"ratio points"}. This is a difference, not a ranking or recommendation.`:"Periods or currencies differ, or inputs are missing. No like-for-like difference is calculated."}</p>
    </>}
  </section>;
}
