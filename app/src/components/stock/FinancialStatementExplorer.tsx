import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FinancialHistoryEntry, FiscalPeriodType } from "@/api/types";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { finiteFinancial, financialPercent, financialPeriod, growthPercent, metricNumber, metricPoints, statementMetrics, type FinancialMetric } from "@/lib/financialPresentation";
import { FundamentalDetail, FundamentalHeading } from "./FundamentalDetail";

export const financialTab = (active:boolean) => `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "contrast-active" : "text-muted-foreground hover:text-foreground"}`;
export function FinancialTrend({history,metric,title,balance=false}: {history:FinancialHistoryEntry[];metric:FinancialMetric;title:string;balance?:boolean}) {
  const [learn,setLearn]=useState(false);
  const points=metricPoints(history,metric).slice(-5);
  const any=points.some(p=>p.value!=null);
  return <>
    {any ? <><div className="h-52 w-full min-w-0" role="img" aria-label={`${metric.label} history`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{top:16,right:8,left:0,bottom:0}}>
      <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
      <XAxis dataKey="period" tick={{fontSize:"0.625rem"}} axisLine={false} tickLine={false} minTickGap={8}/>
      <YAxis yAxisId="value" hide domain={[(min:number)=>Math.min(0,min),"auto"]}/><YAxis yAxisId="growth" hide orientation="right" domain={["auto","auto"]}/>
      <Tooltip formatter={(v:number,name:string)=>name==="YoY"||name==="Liabilities / assets"?`${Number(v).toFixed(1)}%`:metricNumber(v,metric)} contentStyle={{background:"hsl(var(--popover))",color:"hsl(var(--popover-foreground))",border:"1px solid hsl(var(--border))",fontSize:"0.75rem"}}/>
      <Bar yAxisId="value" dataKey="value" name={metric.label} fill="#4f7cf5" maxBarSize={26} isAnimationActive={false}/>
      {balance&&<Bar yAxisId="value" dataKey="liabilities" name="Liabilities" fill="#22c3d6" maxBarSize={18} isAnimationActive={false}/>}
      <Line yAxisId="growth" dataKey={balance?"ratio":"yoy"} name={balance?"Liabilities / assets":"YoY"} stroke="#f97316" strokeWidth={2} dot={{r:3}} connectNulls={false} isAnimationActive={false}/>
    </ComposedChart></ResponsiveContainer></div>
    <div className="overflow-x-auto"><table className="financial-values w-full table-fixed text-center text-xs tabular-nums"><caption className="sr-only">{title} chart values</caption><thead><tr>{points.map(p=><th className="font-normal py-1" key={p.period}>{p.period}</th>)}</tr></thead><tbody><tr>{points.map(p=><td className="text-blue-500 py-1" key={p.period}>{metricNumber(p.value,metric)}</td>)}</tr>{balance&&<tr>{points.map(p=><td className="text-cyan-500 py-1" key={p.period}>{metricNumber(p.liabilities,metric)}</td>)}</tr>}<tr>{points.map(p=><td className={`py-1 ${balance?"text-orange-500":(p.yoy??0)>=0?"text-bull":"text-bear"}`} key={p.period}>{balance?(p.ratio==null?"—":`${p.ratio.toFixed(1)}%`):financialPercent(p.yoy)}</td>)}</tr></tbody></table></div>
    <p className="text-center text-xs text-muted-foreground py-1"><span className="text-blue-500">●</span> {metric.label} {balance&&<><span className="text-cyan-500">●</span> Liabilities </>}· <span className="text-orange-500">●</span> {balance?"Liabilities / assets":"YoY"}</p></>:
      <p className="py-3 text-sm text-muted-foreground">No reported {metric.label.toLowerCase()} history is on file yet.</p>}
    {metric.description&&<div className="border-t border-border py-2"><button className="text-xs text-primary" aria-expanded={learn} onClick={()=>setLearn(!learn)}>Learn more about {metric.label} {learn?"−":"+"}</button>{learn&&<p className="text-sm text-muted-foreground mt-1">{metric.description}</p>}</div>}
  </>;
}
export function StatementTable({history,metrics,yoy}: {history:FinancialHistoryEntry[];metrics:FinancialMetric[];yoy:boolean}) {
  const rows=[...history].sort((a,b)=>b.fiscalYear-a.fiscalYear||(b.fiscalQuarter??0)-(a.fiscalQuarter??0));
  return <div className="overflow-x-auto" tabIndex={0} aria-label="Scrollable financial statement"><table className="financial-statement text-sm w-full"><thead><tr><th className="sticky left-0 z-10 bg-background min-w-[160px] text-left p-2">Metric</th>{rows.map(row=><th key={financialPeriod(row)} className="min-w-[125px] p-2 text-right whitespace-nowrap">{financialPeriod(row)}</th>)}</tr></thead><tbody>{metrics.map(metric=><tr key={metric.label} className="border-t border-border"><th className="sticky left-0 z-10 bg-background p-2 text-left font-medium">{metric.label}</th>{rows.map(row=>{const prev=history.find(p=>p.fiscalYear===row.fiscalYear-1&&(p.fiscalQuarter??null)===(row.fiscalQuarter??null));const growth=growthPercent(metric.get(row),prev?metric.get(prev):null);return <td key={financialPeriod(row)} className="p-2 text-right whitespace-nowrap tabular-nums">{metricNumber(metric.get(row),metric)}{yoy&&<span className={`block text-xs ${growth==null?"text-muted-foreground":growth>=0?"text-bull":"text-bear"}`}>{financialPercent(growth)}</span>}</td>;})}</tr>)}</tbody></table>{!rows.length&&<p className="py-3 text-sm text-muted-foreground">No statements for this period type. Try Annual; quarterly data is never interpolated.</p>}</div>;
}
export function FinancialStatementExplorer({title,history,currency,periodType,symbol}: {title:string;history:FinancialHistoryEntry[];currency:string;periodType:FiscalPeriodType;symbol:string}) {
  const [selected,setSelected]=useState(0), [open,setOpen]=useState(false);
  const metrics=statementMetrics[title], metric=metrics[selected]??metrics[0];
  return <section className="border-t border-border/70 py-3 space-y-2">
    <FundamentalHeading title={title} onOpen={()=>setOpen(true)}/>
    <div className="flex gap-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label={`${title} metric`}>{metrics.map((m,i)=><button key={m.label} role="tab" aria-selected={selected===i} onClick={()=>setSelected(i)} className={financialTab(selected===i)}>{m.label}</button>)}</div>
    <p className="text-xs text-muted-foreground">{periodType==="annual"?"Annual":"Quarterly"} · {currency}</p>
    <FinancialTrend history={history} metric={metric} title={title} balance={title==="Balance sheet"&&selected===0}/>
    <FundamentalDetail title="Financial detail" symbol={symbol} currency={currency} open={open} onOpenChange={setOpen}>{open&&<FinancialDetailBody symbol={symbol} currency={currency} initial={title} initialMetric={selected} initialPeriod={periodType}/>}</FundamentalDetail>
  </section>;
}
function FinancialDetailBody({symbol,currency,initial,initialMetric,initialPeriod}: {symbol:string;currency:string;initial:string;initialMetric:number;initialPeriod:FiscalPeriodType}) {
  const [section,setSection]=useState(initial), [selected,setSelected]=useState(initialMetric), [period,setPeriod]=useState(initialPeriod), [yoy,setYoy]=useState(true);
  const {history,isLoading,historyError,refetchHistory}=useStockFinancials(symbol,{periodType:period,limit:20});
  const metrics=statementMetrics[section],metric=metrics[selected]??metrics[0];
  return <>
    <div className="flex gap-1 overflow-x-auto border-b border-border py-2" role="tablist" aria-label="Financial detail section">{Object.keys(statementMetrics).map(title=><button key={title} role="tab" aria-selected={section===title} className={financialTab(section===title)} onClick={()=>{setSection(title);setSelected(0);}}>{title}</button>)}</div>
    <div className="flex items-center justify-between py-2 text-sm"><label>Period <select aria-label="Statement period" value={period} onChange={e=>setPeriod(e.target.value as FiscalPeriodType)} className="border border-border rounded-md p-1 bg-background"><option value="annual">Annual</option><option value="quarterly">Quarterly</option></select></label><span className="text-muted-foreground">{currency}</span></div>
    <div className="flex gap-1 overflow-x-auto py-1" role="tablist" aria-label="Statement chart metric">{metrics.map((m,i)=><button key={m.label} role="tab" aria-selected={selected===i} className={financialTab(selected===i)} onClick={()=>setSelected(i)}>{m.label}</button>)}</div>
    {historyError&&<div role="alert" className="text-sm text-bear py-2">Statement history could not load. <button className="underline" onClick={()=>void refetchHistory()}>Retry statements</button></div>}
    {isLoading&&!history.length?<p className="text-sm py-3">Loading statements…</p>:<FinancialTrend history={history} metric={metric} title={section}/>}
    <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={yoy} onChange={e=>setYoy(e.target.checked)}/>Show YoY changes</label>
    <StatementTable history={history} metrics={metrics} yoy={yoy}/>
    <p className="text-xs text-muted-foreground py-2">Source: company filings. YoY compares the same fiscal quarter or annual period one year earlier. Missing values are not zero. Ratio returns use period income and closing balances.</p>
    {history.some(r=>r.reportedAt)&&<p className="text-xs text-muted-foreground">Latest filing: {[...history].filter(r=>r.reportedAt).sort((a,b)=>String(b.reportedAt).localeCompare(String(a.reportedAt)))[0]?.reportedAt?.slice(0,10)}</p>}
  </>;
}
