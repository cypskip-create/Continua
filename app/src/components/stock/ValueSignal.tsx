import { useState } from "react";
import { ToolHelp } from "@/components/shared/ToolHelp";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useValuation } from "@/hooks/useValuation";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { financialNumber, finiteFinancial } from "@/lib/financialPresentation";
import { modelPricePath, valueSignal } from "@/lib/valueSignal";
import { PremiumDetail } from "@/components/engine/PremiumDetail";
import { ResearchNumber, ResearchTable } from "./ForecastWorkbenches";

export function ValueSignal({symbol,currency,expanded=false}: {symbol:string;currency:string;expanded?:boolean}) {
  const {valuation,isLoading,isError}=useValuation(symbol);
  const s=valueSignal(valuation);
  return <section className="border-t border-border py-5 space-y-3" aria-label="Basic Continua rating">
    <div className="flex items-center gap-2"><h3 className="text-lg font-semibold">Continua Value Signal</h3> <ToolHelp tool="Continua Value Signal"/></div>
    {isLoading?<p role="status">Calculating rating…</p>:s.stars==null?<p className="text-sm text-muted-foreground">{isError?"Rating feed could not be loaded.":"Unrated — no usable positive model fair value and matching price."}</p>:<><p className="text-2xl text-amber-500" aria-label={`${s.stars} out of 5 stars`}>{"★".repeat(s.stars)}<span className="text-muted-foreground/40">{"★".repeat(5-s.stars)}</span></p><div className="grid grid-cols-2 gap-3 text-sm"><div><span className="block text-muted-foreground">Model fair value</span><strong>{financialNumber(s.fair,currency)}</strong></div><div><span className="block text-muted-foreground">Model-implied upside</span><strong>{s.upside!.toFixed(1)}%</strong></div></div><p className="text-xs text-muted-foreground">{s.models.length} usable model(s) · {s.agreement.toLowerCase()} agreement · provisional model signal</p></>}
    <p className="text-xs text-muted-foreground">Continua v2 uses median fair value rather than an average, and wider rating bands when models disagree or only one is available. It is not a Morningstar rating or a buy/sell recommendation.</p>
    {expanded?<RatingResearch symbol={symbol} currency={currency}/>:<PremiumDetail title="Continua Value Signal research" symbol={symbol} currency={currency}><RatingResearch symbol={symbol} currency={currency}/></PremiumDetail>}
  </section>;
}

export function BasicPriceForecast({symbol,currency,expanded=false}: {symbol:string;currency:string;expanded?:boolean}) {
  const {valuation}=useValuation(symbol);const s=valueSignal(valuation);
  const [months,setMonths]=useState(12),[convergence,setConvergence]=useState(100),[model,setModel]=useState("median"),[stress,setStress]=useState(0);
  const selected=model==="median"?s.fair:s.models.find(m=>m.model===model)?.fairValue??null;
  const target=selected==null?null:selected*(1+(expanded?stress:0)/100);
  const points=modelPricePath(s.price,target,expanded?months:12,expanded?convergence:100);
  return <section className="border-t border-border py-5 space-y-3"><div className="flex items-center gap-2"><h3 className="text-lg font-semibold">{expanded?"Price scenario sensitivity":"Basic price forecast"}</h3> <ToolHelp tool="Basic price forecast"/></div><p className="text-xs text-muted-foreground">Illustrative model-price path, not an analyst target or predicted market price. The default assumes linear convergence to today's median model fair value over 12 months.</p>
    {expanded&&<div className="flex flex-wrap gap-3 text-xs"><label>Horizon <select aria-label="Price scenario horizon" className="border border-border rounded bg-background p-2" value={months} onChange={e=>setMonths(Number(e.target.value))}>{[6,12,24,36].map(n=><option key={n} value={n}>{n} months</option>)}</select></label><label>Convergence <input aria-label="Price scenario convergence" className="border border-border rounded bg-background p-2 w-20" type="number" min={0} max={100} value={convergence} onChange={e=>setConvergence(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/> %</label></div>}
    {expanded&&<><label className="block text-sm">Model anchor<select aria-label="Price research model" className="border border-border rounded bg-background p-2 ml-2 max-w-full" value={model} onChange={e=>setModel(e.target.value)}><option value="median">Median usable models</option>{s.models.map(m=><option key={m.model} value={m.model}>{m.model}</option>)}</select></label><ResearchNumber label="Fair-value stress %" value={stress} onChange={setStress} min={-75} max={100}/><p className="text-xs text-muted-foreground">Stress shifts the selected model value, not its underlying inputs. Convergence and horizon are your assumptions; no likelihood or timing estimate is inferred.</p></>}
    {points.length?<><div className="flex justify-between text-sm"><span>Reference: <strong>{financialNumber(s.price,currency)}</strong></span><span>Scenario: <strong>{financialNumber(points.at(-1)?.value,currency)}</strong></span></div><div className="h-52 min-w-0" role="img" aria-label={expanded?"Expanded price scenario chart":"Basic model price forecast chart"}><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4"/><XAxis dataKey="month" tick={{fontSize:"0.625rem"}}/><YAxis width={52} domain={["auto","auto"]} tickFormatter={v=>financialNumber(v)} tick={{fontSize:"0.625rem"}}/><Tooltip formatter={(v:number)=>financialNumber(v,currency)} contentStyle={{background:"hsl(var(--popover))",border:"1px solid hsl(var(--border))"}}/><Line dataKey="value" name="Illustrative price" stroke="#7865e9" strokeDasharray="5 4" dot={{r:3}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></>:<p className="text-sm text-muted-foreground">No usable valuation inputs for a price scenario. No forecast is invented.</p>}
    <p className="text-xs text-muted-foreground">Model values can change. No probability, expected return, dividend adjustment or guarantee of convergence is implied.</p>
    {expanded&&<><h4 className="font-semibold">Convergence sensitivity</h4><ResearchTable headers={["Assumed convergence","Scenario price","Price change"]} rows={[0,25,50,75,100].map(c=>{const end=modelPricePath(s.price,target,months,c).at(-1)?.value;return [`${c}%`,financialNumber(end,currency),end!=null&&s.price?`${((end/s.price-1)*100).toFixed(1)}%`:"—"];})}/></>}
    {!expanded&&<PremiumDetail title="Price forecast research" symbol={symbol} currency={currency}><BasicPriceForecast symbol={symbol} currency={currency} expanded/></PremiumDetail>}
  </section>;
}

/** Mounted only after subscriber verification; basic stars remain outside this boundary. */
export function RatingResearch({symbol,currency}: {symbol:string;currency:string}) {
  const {valuation}=useValuation(symbol);const {history}=useStockFinancials(symbol,{periodType:"annual",limit:10});const s=valueSignal(valuation);
  const annual=[...history].sort((a,b)=>a.fiscalYear-b.fiscalYear);const latest=annual.at(-1);
  const ni=finiteFinancial(latest?.netIncome),cash=finiteFinancial(latest?.operatingCashFlow),equity=finiteFinancial(latest?.totalEquity),debt=finiteFinancial(latest?.totalDebt);
  const positiveYears=annual.filter(r=>(finiteFinancial(r.netIncome)??0)>0).length;
  const evidence=[
    ["Earnings resilience",`${positiveYears}/${annual.filter(r=>finiteFinancial(r.netIncome)!=null).length} covered annual periods profitable. Missing periods are not passes.`],
    ["Cash conversion",ni!=null&&ni>0&&cash!=null?`${(cash/ni).toFixed(2)}× operating cash / earnings in ${latest?.fiscalYear}. Review working capital and one-off items.`:"Insufficient positive earnings/cash-flow inputs."],
    ["Balance-sheet leverage",equity!=null&&equity>0&&debt!=null?`${(debt/equity).toFixed(2)}× disclosed debt/equity. Sector context matters; financial firms differ from industrial companies.`:"Complete disclosed debt/equity inputs unavailable."],
    ["Business durability","No independent economic-moat assessment is licensed or supplied. Ratios alone cannot establish competitive advantage."],
    ["Capital allocation","Review distributions, reinvestment and borrowing together. No management-quality judgement is fabricated from a single ratio."],
  ];
  return <section className="border-t border-border py-5 space-y-4" aria-label="Expanded rating research"><p className="text-xs font-semibold text-primary">ENGINE · PREMIUM RESEARCH</p><h3 className="text-lg font-semibold">Inside the star rating</h3>
    <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">Model value range</p><strong>{financialNumber(s.low,currency)}–{financialNumber(s.high,currency)}</strong></div><div><p className="text-muted-foreground">Model spread / median</p><strong>{s.spread==null?"Unavailable":`${(s.spread*100).toFixed(1)}%`}</strong></div></div>
    <p className="text-xs text-muted-foreground">{s.excluded} unusable or price-mismatched model(s) excluded. The median limits a single extreme model's influence. Shared assumptions can still make all models wrong. Wider star bands are a conservative heuristic, not validated prediction accuracy.</p>
    <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm"><thead><tr><th className="text-left py-2">Usable model</th><th className="text-right px-3">Fair value</th><th className="text-right">Implied upside</th></tr></thead><tbody>{s.models.map(m=><tr className="border-t border-border" key={m.model}><th className="text-left py-2 font-normal">{m.model}</th><td className="text-right px-3">{financialNumber(m.fairValue,currency)}</td><td className="text-right">{s.price?`${((m.fairValue!/s.price-1)*100).toFixed(1)}%`:"—"}</td></tr>)}</tbody></table></div>
    {s.models.map(m=><details key={m.model} className="border-b border-border pb-3"><summary className="font-semibold cursor-pointer text-sm">{m.model} · assumptions & inputs</summary><p className="mt-2 text-xs text-muted-foreground">{m.methodology}</p><dl className="mt-2 text-xs">{Object.entries(m.inputs??{}).map(([key,v])=><div key={key} className="flex justify-between gap-3 py-1"><dt>{key}</dt><dd>{typeof v==="number"?financialNumber(v):v??"—"}</dd></div>)}</dl></details>)}
    <h4 className="font-semibold">Rating-band sensitivity</h4><p className="text-xs text-muted-foreground">At the same median fair value, four stars require reference price ≤{s.fair?financialNumber(s.fair/(1+s.bands[0]/100),currency):"—"}; five require ≤{s.fair?financialNumber(s.fair/(1+s.bands[1]/100),currency):"—"}. These are model boundaries, not entry recommendations.</p>
    <h4 className="font-semibold">Evidence behind the research</h4>{evidence.map(([title,body])=><div key={title}><h5 className="text-sm font-semibold">{title}</h5><p className="text-xs text-muted-foreground mt-1">{body}</p></div>)}
    <p className="text-xs text-muted-foreground">Latest covered filing: {latest?.reportedAt?new Date(latest.reportedAt).toLocaleDateString():"date unavailable"}. Model/quote timestamps are not supplied by this feed. Check source freshness before interpreting the signal. Continua research is not licensed Morningstar research.</p>
    <p className="text-xs text-muted-foreground">Rating bands: 5 stars ≥{s.bands[1]}% upside; 4 ≥{s.bands[0]}%; 3 between ±{s.bands[0]}%; 2 ≤−{s.bands[0]}%; 1 ≤−{s.bands[1]}%. Classification uses rounded boundaries to prevent floating-point asymmetry. Model spread is not a statistical confidence interval.</p>
  </section>;
}
