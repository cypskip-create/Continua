import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { continuaFetch } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

interface BasicBundle {
  symbol: string; companyName: string; currency: string; generatedAt: string;
  briefing: {title:string;facts:string[];strengths:string[];risks:string[];coverage:string};
  estimates: {fiscalYear:number;fiscalQuarter:number|null;epsEstimate:number|null;revenueEstimate:number|null}[];
  unavailable: string[];
}
export function EngineBasic({symbol,exchange}: {symbol:string;exchange:string}) {
  const {user} = useAuth();
  const [view,setView] = useState('Briefing');
  const q=useQuery({queryKey:['continua','engine-basic',user?.id,exchange,symbol],queryFn:()=>continuaFetch<BasicBundle>(`/engine/basic/${encodeURIComponent(symbol)}`,{params:{exchange}}),staleTime:60000,retry:1});
  return <section className="py-6 space-y-5">
    <p className="text-sm text-muted-foreground">Your Premium plan includes Briefing and basic Forecast. Expanded stock research is still available in Fundamentals.</p>
    <div className="flex gap-2">{['Briefing','Forecast'].map(v=><button key={v} aria-pressed={view===v} className={`rounded-full px-4 py-3 ${view===v?'bg-primary text-primary-foreground':'bg-muted'}`} onClick={()=>setView(v)}>{v}</button>)}</div>
    {q.isPending?<p role="status">Loading company summary…</p>:q.isError?<div role="alert">We couldn’t load this summary. <button onClick={()=>void q.refetch()} className="text-primary">Try again</button></div>:q.data&&<>
      <h2 className="text-xl font-semibold">{q.data.companyName}</h2>
      {view==='Briefing'?<><h3>{q.data.briefing.title}</h3><ul className="space-y-3">{q.data.briefing.facts.map(f=><li key={f}>{f}</li>)}</ul><p className="text-sm text-muted-foreground">{q.data.briefing.coverage}</p></>:<><p className="text-sm text-muted-foreground">Available estimates, not guaranteed outcomes.</p>{q.data.estimates.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Period</th><th>EPS estimate</th><th>Revenue estimate</th></tr></thead><tbody>{q.data.estimates.map((e,i)=><tr key={i}><td>{e.fiscalYear}{e.fiscalQuarter?` Q${e.fiscalQuarter}`:''}</td><td>{e.epsEstimate??'Not available'}</td><td>{e.revenueEstimate==null?'Not available':`${q.data.currency} ${e.revenueEstimate.toLocaleString()}`}</td></tr>)}</tbody></table></div>:<p>No verified analyst estimates are available for this company yet.</p>}</>}
      <p className="text-xs text-muted-foreground">Updated {new Date(q.data.generatedAt).toLocaleString()}</p>
    </>}
    <div className="rounded-2xl border border-primary/20 p-5 space-y-3"><h3 className="font-semibold">Unlock the full Engine</h3><p className="text-sm text-muted-foreground">Premium Plus adds analysis workbenches, scenario labs, peers, monitoring and Ask Engine.</p><Link to="/upgrade" className="inline-block text-primary font-semibold">Premium Plus · KES 1,000/month →</Link></div>
  </section>;
}
