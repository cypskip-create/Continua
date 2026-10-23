import {useQuery} from '@tanstack/react-query';
import {continuaFetch} from '@/api/client';
type Activity={code:string;label:string;unit:string;value:number;change:number|null;deals:number|null;asOf:string};
export function NseActivityCards(){
 const query=useQuery({queryKey:['continua','nse-activity'],queryFn:()=>continuaFetch<Activity[]>('/market-statistics'),staleTime:60000,refetchInterval:60000,retry:1});
 return <>{(query.data??[]).map(stat=><div key={stat.code} className="min-w-[170px] shrink-0 text-left">
  <p className="text-sm text-muted-foreground">{stat.label}</p>
  <p className="my-2 text-xl font-semibold tabular-nums">{stat.value.toLocaleString('en-KE',{maximumFractionDigits:stat.unit==='KES'?2:0})}</p>
  {stat.code==='ETF_UNITS'?<p className="text-sm">{stat.deals==null?'Units traded':`${stat.deals.toLocaleString()} deals`}</p>:stat.change!=null&&<p className={`text-sm ${stat.change>=0?'text-bull':'text-bear'}`}>{stat.change>0?'+':''}{stat.change.toLocaleString('en-KE',{maximumFractionDigits:2})} {stat.unit}</p>}
  <p className="mt-2 text-xs text-muted-foreground">{new Date(stat.asOf).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Nairobi'})}</p>
 </div>)}</>;
}
