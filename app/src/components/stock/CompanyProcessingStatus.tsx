import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/continua/browserClient';
const labels:Record<string,string>={awaiting_collection:'Awaiting eligible evidence',archive_pending:'Archiving evidence',retry_scheduled:'Retry scheduled',extraction_pending:'Extracting source data',processing_pending:'Engine processing pending',review_required:'Evidence needs review',preparing:'Preparing Cloudflare data',processed:'Known evidence processed'};
type Status={state:string;collectedFiles:number;archivedFiles:number;processedFiles:number;preparedFiles:number;awaitingReview:number;failedFiles:number;lastCollectedAt:string|null;lastProcessedAt:string|null;scope:string};
export function CompanyProcessingStatus({symbol}:{symbol:string}){
 const q=useQuery({queryKey:['continua','processing-status',symbol],queryFn:async()=>{const {data,error}=await (supabase.rpc as any)('company_processing_status',{p_symbol:symbol});if(error)throw Error('Processing status unavailable');return data as Status|null;},enabled:/^[A-Z0-9.-]{1,20}$/.test(symbol),staleTime:120000,retry:1,refetchInterval:query=>query.state.data&&query.state.data.state!=='processed'?120000:false,refetchIntervalInBackground:false});
 return <section aria-label="Company processing status" className="rounded-xl border p-3 text-xs space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Engine processing</h3><button type="button" className="text-primary" disabled={q.isFetching} onClick={()=>void q.refetch()}>{q.isFetching?'Checking…':'Refresh status'}</button></div>
  {q.isError?<p role="status">Processing status could not load. No completion status is assumed.</p>:!q.data?<p role="status">{q.isLoading?'Loading processing status…':'No processing receipt is available.'}</p>:<>
   <p className="font-medium">{labels[q.data.state]??'Status unavailable'}</p><p>{q.data.collectedFiles} collected · {q.data.archivedFiles} archived · {q.data.processedFiles} processed · {q.data.preparedFiles} prepared</p>
   <p>{q.data.awaitingReview} awaiting review · {q.data.failedFiles} with unresolved failures</p>
   <p>Last collected: {q.data.lastCollectedAt?new Date(q.data.lastCollectedAt).toLocaleString():'Unavailable'}. Last processed: {q.data.lastProcessedAt?new Date(q.data.lastProcessedAt).toLocaleString():'Unavailable'}.</p>
   <p className="text-muted-foreground">{q.data.scope}</p>
  </>}
 </section>;
}
