import {useQuery} from '@tanstack/react-query';
import {continuaFetch} from '@/api/client';
type Table={category:string;columns:string[];rows:{label:string;rowKind:string;values:string[]}[];sourceUrl:string;observedAt:string;status:'publisher_observation'};
export function PublisherFinancialTables({symbol}:{symbol:string}) {
 const data=useQuery({queryKey:['publisher-financial-tables',symbol],queryFn:()=>continuaFetch<Table[]>(`/financials/${encodeURIComponent(symbol)}/publisher-tables`),staleTime:60000,refetchInterval:300000,retry:1});
 if(!data.data?.length)return null;
 return <details className="border-t py-4"><summary className="cursor-pointer font-semibold">Additional financial tables · KenyanStocks</summary>
  <p className="py-3 text-xs text-muted-foreground">Publisher observations, with original rounding and year labels. Kept separate from verified issuer filings and valuation calculations until the Engine validates the source reports.</p>
  {data.data.map((table,i)=><section key={`${table.category}-${i}`} className="min-w-0 py-3"><h4>{table.category}</h4><div className="overflow-x-auto max-w-full" role="region" aria-label={`${table.category} financial years`} tabIndex={0}><table className="w-full text-xs"><thead><tr>{table.columns.map((c,j)=><th key={j} className="p-2 text-left whitespace-nowrap">{c}</th>)}</tr></thead><tbody>{table.rows.map((row,j)=><tr key={j} className="border-t"><th className="p-2 text-left min-w-[160px] font-medium">{row.label}</th>{row.values.map((v,k)=><td key={k} className="p-2 whitespace-nowrap tabular-nums">{v||'—'}</td>)}</tr>)}</tbody></table></div><p className="mt-2 text-xs text-muted-foreground"><a href={table.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Source table</a> · Collected {new Date(table.observedAt).toLocaleDateString()}</p></section>)}
 </details>;
}
