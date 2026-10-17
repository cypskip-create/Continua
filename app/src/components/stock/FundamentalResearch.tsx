import { EngineAccess } from '@/components/engine/EngineAccess';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import {continuaFetch} from '@/api/client';
import { useResearch } from "@/hooks/useResearch";
import { useValuation } from "@/hooks/useValuation";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { screenerApi } from "@/api/screenerApi";
import { financialNumber, finiteFinancial, financialPeriod } from "@/lib/financialPresentation";
import type { ComputedRatios, ScreenerRow } from "@/api/types";
import { FundamentalDetail, FundamentalHeading } from "./FundamentalDetail";
import { financialTab } from "./FinancialStatementExplorer";
import {publisherCurrentMultiple} from '@/lib/publisherCharts';
import { ValuationSection } from "./report/ValuationSection";

const colors=["#4f7cf5","#22c3d6","#84cc16","#facc15","#fb923c","#f97316"];
const tooltipStyle={background:"hsl(var(--popover))",color:"hsl(var(--popover-foreground))",border:"1px solid hsl(var(--border))",fontSize:"0.75rem"};
type RatioKey="pe"|"pb"|"ps";
type DatedRatio={date:string;time:number;ratio:number|null;price:number;fiscalYear:number|null;reportedAt:string|null;denominator:number|null;sourceUrls:string[]};
type ValuationHistory={current:DatedRatio|null;points:DatedRatio[];lastHistoricalDate:string|null;basis:string};
export function DisclosureDonut({rows,label}: {rows:{name:string;value:number}[];label:string}) {
  return <div className="grid grid-cols-[minmax(100px,1fr)_minmax(0,1.5fr)] items-center gap-2 py-2">
    <div className="h-36" role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" stroke="hsl(var(--background))" isAnimationActive={false}>{rows.map((r,i)=><Cell key={r.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={(v:number)=>`${Number(v).toFixed(2)}%`} contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer></div>
    <ul className="space-y-1 text-sm">{rows.map((r,i)=><li key={r.name} className="flex items-center gap-1"><span aria-hidden style={{color:colors[i%colors.length]}}>●</span><span className="flex-1 truncate" title={r.name}>{r.name}</span><span className="tabular-nums">{r.value.toFixed(2)}%</span></li>)}</ul>
  </div>;
}
function AverageBars({current,average,median,symbol}: {current:number|null;average:number|null;median:number|null;symbol:string}) {
  const max=Math.max(current??0,average??0,median??0,1);
  return <div className="space-y-2 py-2 text-sm">{[[symbol,current,colors[0]],["Sample average",average,colors[1]],["Sample median",median,"#94a3b8"]].map(([label,value,color])=><div key={String(label)} className="grid grid-cols-[minmax(0,1fr)_1fr_60px] items-center gap-2"><span>{String(label)}</span><div className="bg-muted h-2"><div style={{width:`${Math.max(0,Number(value??0))/max*100}%`,background:String(color)}} className="h-full"/></div><span className="text-right">{value==null?"—":Number(value).toFixed(2)}</span></div>)}</div>;
}
function ValuationExplorer({symbol,sector,currency,price,preview=false}: {symbol:string;sector:string;currency:string;price:number;preview?:boolean}) {
  const [key,setKey]=useState<RatioKey>("pe"),[years,setYears]=useState(5);
  const {history}=useStockFinancials(symbol,{periodType:"annual",limit:10,publisherObservations:true});
  const {data:market=[]}=useQuery({queryKey:["continua","screener","valuation-sample"],queryFn:()=>screenerApi.run({limit:200,sortBy:"marketCap",sortDirection:"desc"}),staleTime:15*60_000,retry:1});
  const {data:valuationHistory,isError:valuationError}=useQuery({queryKey:['continua','dated-valuation',symbol,key,years],queryFn:()=>continuaFetch<ValuationHistory>(`/valuation/${encodeURIComponent(symbol)}/history`,{params:{ratio:key,years}}),staleTime:5*60_000,retry:1});
  const latestObserved=[...history].sort((a,b)=>a.fiscalYear-b.fiscalYear).at(-1);
  const observedMultiple=publisherCurrentMultiple(latestObserved,price,key);
  const current=valuationHistory?.current?.ratio??observedMultiple;
  const points=valuationHistory?.points??[];
  const valid=points.flatMap(p=>p.ratio!=null?[p.ratio]:[]).sort((a,b)=>a-b);
  const percentile=valuationHistory?.current?.ratio!=null&&valid.length?valid.filter(v=>v<=valuationHistory.current!.ratio!).length/valid.length*100:null;
  const lower=valid.length?valid[Math.floor((valid.length-1)*.25)]:null, upper=valid.length?valid[Math.floor((valid.length-1)*.75)]:null;
  const peerValue=(r:ScreenerRow)=>key==="ps"?null:finiteFinancial(r[key]);
  const marketRows=market.filter(r=>peerValue(r)!=null&&(peerValue(r)??0)>0);
  const peers=marketRows.filter(r=>r.sector===sector);
  const stats=(rows:ScreenerRow[])=>{const values=rows.map(r=>peerValue(r)!).sort((a,b)=>a-b);return {avg:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,median:values.length?(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2:null,rank:rows.some(r=>r.symbol===symbol)?1+values.filter(v=>v<peerValue(rows.find(r=>r.symbol===symbol)!)).length:null};};
  const peerStats=stats(peers), marketStats=stats(marketRows);
  const bins=[{name:"0–10",value:0},{name:"10–30",value:0},{name:"30–50",value:0},{name:"Over 50",value:0}];
  marketRows.forEach(r=>{const n=peerValue(r)!;bins[n<10?0:n<30?1:n<50?2:3].value++;});
  const annual=[...history].sort((a,b)=>a.fiscalYear-b.fiscalYear), base=annual.find(r=>Number(r.netIncome)>0);
  const growth=annual.filter(r=>base&&r.fiscalYear>=base.fiscalYear).map(r=>({period:financialPeriod(r),income:Number(base?.netIncome)>0&&r.netIncome!=null?Number(r.netIncome)/Number(base?.netIncome):null,cap:null as number|null}));
  return <>
    <div role="tablist" aria-label="Valuation ratio" className="flex gap-1 py-2">{(["pe","pb","ps"] as const).map(k=><button key={k} role="tab" aria-selected={key===k} onClick={()=>setKey(k)} className={financialTab(key===k)}>{k==="pe"?"P/E":k==="pb"?"P/B":"P/S"}</button>)}</div>
    <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Historical distribution</h3><select aria-label="Valuation history range" className="bg-background border border-border rounded-md p-1 text-xs" value={years} onChange={e=>setYears(Number(e.target.value))}><option value={1}>1 year</option><option value={3}>3 years</option><option value={5}>5 years</option></select></div>
    <dl className="grid grid-cols-3 gap-2 py-3 text-sm"><div><dt className="text-muted-foreground">Current {key.toUpperCase()}</dt><dd className="text-xl font-semibold">{current?.toFixed(2)??"—"}</dd></div><div><dt className="text-muted-foreground">Percentile</dt><dd className="text-xl font-semibold">{percentile?.toFixed(0)??"—"}{percentile!=null?"%":""}</dd></div><div><dt className="text-muted-foreground">Forward ratio</dt><dd className="font-semibold">Not covered</dd></div></dl>
    {valuationError&&<p className="text-sm text-destructive">Dated valuation history could not load.</p>}
    {valuationHistory?.current?.ratio==null&&observedMultiple!=null&&<p className="text-xs text-muted-foreground pb-2">Current quote divided by FY{latestObserved?.fiscalYear} publisher-observed {key==='pe'?'EPS':key==='pb'?'book value per share':'revenue per share'}. Source rounding is retained. This observed multiple is not inserted into historical valuations; disclosure dates are unavailable.</p>}
    {valuationHistory?.current?.ratio!=null&&<p className="text-xs text-muted-foreground pb-2">Quote {valuationHistory.current.date}: {financialNumber(valuationHistory.current.price,currency)} · FY{valuationHistory.current.fiscalYear??'—'} denominator {valuationHistory.current.denominator?.toFixed(2)??'—'}. {valuationHistory.lastHistoricalDate&&valuationHistory.lastHistoricalDate!==valuationHistory.current.date?`The historical line ends ${valuationHistory.lastHistoricalDate}; it is not today's quote.`:''}</p>}
    {valuationHistory?.current?.fiscalYear!=null&&new Date().getUTCFullYear()-valuationHistory.current.fiscalYear>2&&<p className="text-xs text-amber-700 pb-2">Financial coverage is old (FY{valuationHistory.current.fiscalYear}). This is not a current-year earnings multiple.</p>}
    {valid.length>1?<div className="h-56" role="img" aria-label="Historical valuation distribution"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{top:12,right:12,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4"/><XAxis dataKey="time" type="number" scale="time" domain={['dataMin','dataMax']} minTickGap={50} tickFormatter={v=>new Date(v).toLocaleDateString('en',{month:'short',year:'2-digit',timeZone:'UTC'})} tick={{fontSize:"0.625rem"}} axisLine={false} tickLine={false}/><YAxis width={44} tick={{fontSize:"0.625rem"}} domain={["auto","auto"]} tickFormatter={v=>Number(v).toFixed(1)} axisLine={false} tickLine={false}/><Tooltip labelFormatter={v=>new Date(Number(v)).toISOString().slice(0,10)} formatter={(v:number)=>Number(v).toFixed(2)} contentStyle={tooltipStyle}/>{lower!=null&&upper!=null&&<ReferenceArea y1={lower} y2={upper} fill="#4f7cf5" fillOpacity={.08} stroke="none"/>}<ReferenceLine y={valid.reduce((s,v)=>s+v,0)/valid.length} stroke="#94a3b8" strokeDasharray="3 3"/><Line type="linear" dataKey="ratio" name={key.toUpperCase()} stroke="#4f7cf5" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>{peerStats.avg!=null&&<ReferenceLine y={peerStats.avg} stroke="#22c3d6" strokeDasharray="4 4"/>}</ComposedChart></ResponsiveContainer></div>:<p className="py-3 text-sm text-muted-foreground">Historical ratios need price history and dated annual disclosures{key!=="pe"?" with shares outstanding":" with positive EPS"}. Missing disclosure dates are not guessed.</p>}
    <p className="text-xs text-muted-foreground py-2">Historical band is the middle 50% of observations—not a fair-value range. Ratios use the latest annual filing available on each date, not a TTM or forward estimate. Share-count changes can affect comparability.</p>
    {!preview&&<><section className="border-t border-border py-3"><h3 className="text-lg font-semibold">Earnings growth</h3>{growth.length>1?<><div className="h-48" role="img" aria-label="Reported income growth multiple"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={growth}><XAxis dataKey="period" tick={{fontSize:"0.625rem"}}/><YAxis width={40} tickFormatter={v=>`${v.toFixed(1)}x`} tick={{fontSize:"0.625rem"}}/><Tooltip contentStyle={tooltipStyle} formatter={(v:number)=>`${Number(v).toFixed(2)}x`}/><Line dataKey="income" name="Net income / base year" stroke="#4f7cf5" dot={false} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div><p className="text-xs text-muted-foreground">Net income relative to {base?.fiscalYear}. Historical market capitalisation is not supplied; it is not inferred from today's shares.</p></>:<p className="text-sm text-muted-foreground py-2">At least two comparable positive-base annual periods are needed.</p>}</section>
    {[{title:"Industry distribution",rows:peers,stats:peerStats},{title:"Market distribution",rows:marketRows,stats:marketStats}].map(({title,rows,stats:s})=><section key={title} className="border-t border-border py-3"><h3 className="text-lg font-semibold">{title}</h3><p className="text-xs text-muted-foreground py-1">{rows.length} covered companies · positive {key.toUpperCase()} only · snapshot, not the entire exchange</p>{s.rank!=null&&<p className="text-sm py-1">Low-to-high ratio rank: <strong>{s.rank}/{rows.length}</strong></p>}<AverageBars symbol={symbol} current={current} average={s.avg} median={s.median}/>{title==="Industry distribution"&&rows.some(r=>r.marketCap!=null)?<div className="h-48" role="img" aria-label="Industry valuation scatter"><ResponsiveContainer width="100%" height="100%"><ScatterChart><XAxis type="number" dataKey="ratio" name={key.toUpperCase()} tick={{fontSize:"0.625rem"}}/><YAxis type="number" dataKey="marketCap" name="Market cap" tickFormatter={v=>financialNumber(v)} width={60} tick={{fontSize:"0.625rem"}}/><Tooltip cursor={{strokeDasharray:"3 3"}} contentStyle={tooltipStyle} formatter={(v:number,n:string)=>n==="Market cap"?financialNumber(v,currency):Number(v).toFixed(2)}/><Scatter data={rows.filter(r=>r.marketCap!=null).map(r=>({ratio:peerValue(r),marketCap:r.marketCap,name:r.symbol}))}>{rows.filter(r=>r.marketCap!=null).map(r=><Cell key={r.symbol} fill={r.symbol===symbol?colors[0]:colors[1]}/>)}</Scatter></ScatterChart></ResponsiveContainer></div>:null}{title==="Market distribution"&&rows.length>0&&<DisclosureDonut rows={bins.map(b=>({name:`${b.name} · ${b.value} companies`,value:b.value/rows.length*100}))} label="Market valuation buckets"/>}{key==="ps"&&<p className="text-sm text-muted-foreground">The current screener does not publish peer P/S ratios.</p>}</section>)}
    <Link to={`/compare?symbols=${encodeURIComponent([symbol,...peers.filter(r=>r.symbol!==symbol).slice(0,2).map(r=>r.symbol)].join(","))}`} className="block text-primary text-sm font-semibold py-3">Compare sector peers →</Link></>}
  </>;
}
export function ValuationPreview(props: {symbol:string;name:string;sector:string;price:number;currency:string}) {
  const [open,setOpen]=useState(false);const {research}=useResearch(props.symbol);
  return <section className="border-t border-border py-3 space-y-2"><FundamentalHeading title="Valuation" onOpen={()=>setOpen(true)}/><ValuationExplorer {...props} preview/><p className="text-xs text-muted-foreground">Historical distributions, reported growth and peer comparisons</p><FundamentalDetail title="Valuation" symbol={props.symbol} currency={props.currency} open={open} onOpenChange={setOpen}>{open&&<><ValuationExplorer {...props}/><details className="border-t border-border py-3"><summary className="font-semibold cursor-pointer">Fair value models and evidence</summary><EngineAccess symbol={props.symbol}><ValuationSection {...props}/></EngineAccess></details></>}</FundamentalDetail></section>;
}
export function ResearchPreview({symbol,currency}: {symbol:string;currency:string}) {
  const [open,setOpen]=useState(false);const {valuation}=useValuation(symbol),{research}=useResearch(symbol);
  const models=valuation?.models.filter(m=>m.fairValue!=null&&Number.isFinite(Number(m.fairValue)))??[];
  const fair=models.length?models.reduce((sum,m)=>sum+Number(m.fairValue),0)/models.length:null;
  const r=research?.ratios;
  const rows=[
    ["Fair value",fair==null?"No usable model is on file.":`Equal-weighted model fair value: ${financialNumber(fair,currency)}. ${models.length} available model(s). Not an analyst target.`],
    ["Economic moat","No verified moat classification is supplied. Business durability needs independent research."],
    ["Uncertainty","Model outputs depend on their stated inputs. No verified uncertainty rating is supplied."],
    ["Capital allocation",r?.payoutRatio!=null?`Reported payout ratio: ${(r.payoutRatio*100).toFixed(1)}%. Review reinvestment, distributions and debt together.`:"No complete capital-allocation assessment is available."],
    ["Bulls say",r?.roe!=null?`Observed return on equity: ${(r.roe*100).toFixed(1)}%. This is a reported ratio, not a forward growth claim.`:"No sourced bull-case assessment is available."],
    ["Bears say",r?.debtToEquity!=null?`Debt/equity: ${r.debtToEquity.toFixed(2)}x. Sector context and maturity disclosures matter.`:"No sourced bear-case assessment is available."],
    ["Financial health",r?.currentRatio!=null?`Current ratio: ${r.currentRatio.toFixed(2)}x. Liquidity ratios are not comparable across all sectors.`:"No current liquidity ratio is on file."],
    ["Analyst note","Continua model research, not Morningstar research. Third-party analyst reports and consensus ratings are not licensed or supplied."],
  ];
  return <section className="border-t border-border py-3 space-y-2"><FundamentalHeading title="Continua research" onOpen={()=>setOpen(true)}/><div className="flex justify-between text-sm"><span className="text-muted-foreground">Model fair value</span><strong>{fair==null?"Unavailable":financialNumber(fair,currency)}</strong></div><p className="text-xs text-muted-foreground">Fair value, financial health and balanced research questions</p><FundamentalDetail title="Continua research" symbol={symbol} currency={currency} open={open} onOpenChange={setOpen}>{rows.map(([title,text])=><details key={title} className="border-b border-border py-3" open={title==="Fair value"}><summary className="cursor-pointer font-semibold text-base">{title}</summary><p className="mt-2 text-sm text-muted-foreground">{text}</p></details>)}{models.map(m=><section key={m.model} className="border-b border-border py-3"><h3 className="text-base font-semibold">{m.model}</h3><p className="text-lg font-semibold">{financialNumber(m.fairValue,currency)}</p><p className="text-sm text-muted-foreground">{m.methodology}</p></section>)}<Link to={`/engine?symbol=${encodeURIComponent(symbol)}`} className="block py-3 text-primary font-semibold">Continue research in Engine →</Link></FundamentalDetail></section>;
}
