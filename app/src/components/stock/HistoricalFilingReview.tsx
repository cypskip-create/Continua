import { useState } from 'react';
import { adminFinancialsApi, type CandidateDraft } from '@/api/adminFinancialsApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
export function HistoricalFilingReview({candidateId,draft,securityId,onDone}:{candidateId:string;draft:CandidateDraft;securityId:string;onDone:()=>void}) {
  const [json,setJson]=useState('');
  const [verified,setVerified]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const prepare=()=>{
    setVerified(false);
    setJson(JSON.stringify({securityId,statementType:draft.statementType,unitsVerified:true,periods:(draft.historicalColumns??[]).map(c=>({columnIndex:c.columnIndex,period:{periodType:'annual',fiscalYear:null,fiscalQuarter:null,periodEnd:'REVIEW',reportedAt:'REVIEW',currency:'KES'},[draft.statementType]:Object.fromEntries(Object.entries(c.mapped).filter(([,v])=>v!==null)),sourcePage:1,note:'REVIEW: verify period, group scope, and base-unit conversion',allowRestatement:false}))},null,2));
  };
  const submit=async()=>{setBusy(true);setError('');try{const payload=JSON.parse(json);if(!verified)throw new Error('Verify the original source and units first');await adminFinancialsApi.confirmHistory(candidateId,payload);onDone();}catch(e){setError(e instanceof Error?e.message:'History could not be published');}finally{setBusy(false);}};
  return <details className="rounded-xl border p-4 space-y-3"><summary className="font-semibold cursor-pointer">Review historical columns</summary><p className="text-sm text-muted-foreground">This table has {draft.historicalColumns?.length??0} comparative columns. Review each column against the original PDF. Set its year, dates, source page and company/group scope. Convert money to base KES; do not scale EPS or share counts as money. Delete columns you cannot verify. Existing statements require an explicit restatement review.</p><Button type="button" variant="outline" onClick={prepare}>Prepare all columns for review</Button>{json&&<><Textarea aria-label="Reviewed historical filing JSON" value={json} onChange={e=>{setJson(e.target.value);setVerified(false);}} className="min-h-80 font-mono text-xs"/><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} className="mt-1"/>I checked every period, field, source page and unit against the original filing.</label><Button type="button" disabled={busy||!verified} onClick={()=>void submit()}>{busy?'Publishing reviewed periods…':'Publish reviewed history'}</Button></>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</details>;
}
