import {useQuery} from '@tanstack/react-query';
import {continuaFetch} from '@/api/client';
import {useAuth} from '@/hooks/useAuth';
import {useExchange} from '@/hooks/useExchange';
type Summary={measures:Record<string,{score:number|null;coverage:number}>;holdingCount:number;pricedCount:number;methodology:string};
type Props={holdings:{symbol:string}[];totalValue:number;totalCost:number;gainPct:number};
export function PortfolioSnowflake({holdings}:Props){
 const {user}=useAuth(),{exchange}=useExchange();
 const query=useQuery({queryKey:['continua','portfolio-scorecard',user?.id,exchange,holdings.map(h=>h.symbol).join(',')],queryFn:()=>continuaFetch<Summary>('/engine/portfolio/scorecard',{params:{exchange}}),enabled:!!user&&holdings.length>0,staleTime:300000,retry:1});
 return <section className="rounded-2xl border p-4 space-y-4" aria-label="Portfolio health"><h3 className="text-lg font-semibold">Portfolio health</h3>
  {!holdings.length?<p className="text-sm text-muted-foreground">Add holdings to see your financial-strength assessment.</p>:query.isLoading?<p role="status">Loading portfolio health…</p>:query.error?<p role="alert" className="text-sm">Portfolio health could not load. <button className="underline" onClick={()=>void query.refetch()}>Try again</button></p>:<>
   <div className="grid grid-cols-2 gap-3">{[['health','Financial strength'],['quality','Company quality'],['risk','Price resilience'],['growth','Reported growth']].map(([key,label])=>{const measure=query.data?.measures[key];return <div key={key} className="rounded-xl bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{measure?.score==null?'Unavailable':measure.score.toFixed(0)+'/100'}</p>{measure?.score!=null&&<div className="mt-2 h-1.5 rounded bg-muted"><div className="h-full rounded bg-primary" style={{width:measure.score+'%'}}/></div>}</div>})}</div>
   <details className="text-xs text-muted-foreground"><summary>How portfolio health is calculated</summary><p className="mt-2">{query.data?.methodology}</p><p className="mt-2">Higher scores indicate stronger measured factors. They do not guarantee future performance.</p></details>
  </>}
 </section>;
}
