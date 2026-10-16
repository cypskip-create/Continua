import {useState} from 'react';
import {Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {publisherChartGroups, type PublisherSeries} from '@/lib/publisherCharts';
import {usePublisherResearch} from '@/hooks/usePublisherResearch';

export function usePublisherFinancialCharts(symbol:string) {
 const query=usePublisherResearch(symbol);
 return {...query,data:query.data?publisherChartGroups(query.data):undefined};
}
const compact=(n:number)=>new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:2}).format(n);
function CategoryChart({category,series}:{category:string;series:PublisherSeries[]}) {
 const initial=series.find(s=>s.label.toLowerCase()===`total ${category}`.toLowerCase())?.label||series[0].label;
 const [selected,setSelected]=useState(initial);
 const [style,setStyle]=useState<'bar'|'line'>('bar');
 const metric=series.find(s=>s.label===selected)||series[0];
 return <section className="min-w-0 border-t border-border py-5" aria-label={`${category} publisher charts`}>
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{category}</h3><div className="flex rounded-full border border-border p-1" aria-label={`${category} chart style`}>{(['bar','line'] as const).map(s=><button key={s} type="button" aria-pressed={style===s} onClick={()=>setStyle(s)} className={`rounded-full px-3 py-1 text-xs ${style===s?'contrast-active':'text-muted-foreground'}`}>{s==='bar'?'Bars':'Line'}</button>)}</div></div>
  <label className="my-3 block text-xs text-muted-foreground">Metric<select aria-label={`${category} metric`} value={metric.label} onChange={e=>setSelected(e.target.value)} className="mt-1 block w-full max-w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground">{series.map(s=><option key={s.label} value={s.label}>{s.label}</option>)}</select></label>
  <p className="text-xs text-muted-foreground">{metric.unit==='percent'?'Percent':metric.unit==='KES'?'KES':'Reported units'} · Annual</p>
  <div className="h-60 w-full min-w-0" role="img" aria-label={`${category}: ${metric.label} history`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={metric.points} margin={{top:20,right:12,left:8,bottom:4}}>
   <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4"/><XAxis dataKey="year" tickLine={false} axisLine={false} tick={{fontSize:11}}/>
   <YAxis tickFormatter={compact} width={55} tickLine={false} axisLine={false} tick={{fontSize:10}} domain={[(n:number)=>Math.min(0,n),'auto']}/><ReferenceLine y={0} stroke="hsl(var(--border))"/>
   <Tooltip content={({active,payload,label})=>active&&payload?.length?<div className="max-w-64 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"><p className="font-semibold">{metric.label} · {label}</p><p>{payload[0]?.payload?.raw||'Unavailable'}</p></div>:null}/>
   {style==='bar'?<Bar dataKey="value" fill="#4f7cf5" maxBarSize={36} radius={[4,4,0,0]} isAnimationActive={false}/>:<Line dataKey="value" type="linear" stroke="#4f7cf5" strokeWidth={2} dot={{r:3}} connectNulls={false} isAnimationActive={false}/>}
  </ComposedChart></ResponsiveContainer></div>
  <div className="overflow-x-auto"><table className="w-full text-center text-xs tabular-nums"><caption className="sr-only">{metric.label} chart values</caption><thead><tr>{metric.points.map(p=><th key={p.year} className="px-2 py-1 font-normal text-muted-foreground">{p.year}</th>)}</tr></thead><tbody><tr>{metric.points.map(p=><td key={p.year} className="px-2 py-1">{p.raw||'—'}</td>)}</tr></tbody></table></div>
 </section>;
}
export function PublisherFinancialTables({symbol}:{symbol:string}) {
 const data=usePublisherFinancialCharts(symbol);
 if(data.isPending)return <p role="status" className="py-4 text-sm text-muted-foreground">Loading financial charts…</p>;
 if(data.isError)return <div role="alert" className="py-4 text-sm">Financial charts could not load. <button className="underline" onClick={()=>void data.refetch()}>Try again</button></div>;
 if(!data.data?.length)return null;
 return <div className="min-w-0" aria-label="Engine financial charts"><p className="py-3 text-xs text-muted-foreground">Engine-prepared publisher financials. Original rounding is retained; missing values are not estimated. Separate from verified filing-based valuations.</p>{data.data.map(g=><CategoryChart key={`${symbol}-${g.category}`} {...g}/>)}</div>;
}
