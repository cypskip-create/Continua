import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Flag,VolumeX,UserX} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/useAuth';
import {useToast} from '@/hooks/use-toast';
import {DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
export const COMMUNITY_SAFETY_CHANGED='continua:community-safety-changed';
const reasons=['Spam or scam','Harassment or hate','Misleading financial claims','Copyright infringement','Threats or unsafe content','Other'];
const REPORT_REQUEST='continua:report-request';
/** Menu selection closes normally; the report host survives menu unmounting. */
export function SafetyMenuItems({authorId,postId}:{authorId:string;postId?:string}) {
 const {user}=useAuth(),{toast}=useToast();
 const navigate=useNavigate();
 const [state,setState]=useState<{blocked:boolean;muted:boolean}|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let stopped=false;if(!user||user.id===authorId)return;void Promise.all([
  supabase.from('blocked_users').select('id').eq('blocker_id',user.id).eq('blocked_id',authorId),
  supabase.from('muted_users').select('id').eq('muter_id',user.id).eq('muted_id',authorId)
 ]).then(([b,m])=>{if(stopped)return;if(b.error||m.error){toast({title:"Couldn't load safety controls",variant:'destructive'});return;}setState({blocked:!!b.data?.length,muted:!!m.data?.length});});return()=>{stopped=true;};},[user?.id,authorId]);
 if(user?.id===authorId)return null;
 const change=async(kind:'block'|'mute')=>{
  if(!user||!state||busy)return;
  setBusy(true);
  try{const enabled=!(kind==='block'?state.blocked:state.muted);
   const {error}=await (supabase.rpc as any)('community_set_safety',{p_target:authorId,p_kind:kind,p_enabled:enabled});if(error)throw error;
   setState(s=>s?{...s,[kind==='block'?'blocked':'muted']:enabled}:s);
   window.dispatchEvent(new Event(COMMUNITY_SAFETY_CHANGED));
   if(kind==='block'&&enabled)navigate('/traders-hub');
   toast({title:kind==='block'?(enabled?'Account blocked':'Account unblocked'):(enabled?'Account muted':'Account unmuted'),description:kind==='block'&&enabled?'Signed-in interactions are blocked. Public content is still public.':undefined});
  }catch{toast({title:"Couldn't save that change",description:'Nothing has been confirmed. Please retry.',variant:'destructive'});}finally{setBusy(false);}
 };
 const start=(kind:'post'|'user')=>{if(!user){toast({title:'Sign in to report or manage accounts'});return;}window.dispatchEvent(new CustomEvent(REPORT_REQUEST,{detail:{kind,target:kind==='post'?postId:authorId}}));};
 return <>
  <DropdownMenuItem disabled={!user||!state||busy} onSelect={()=>void change('mute')}><VolumeX className="h-4 w-4 mr-2"/>{state?.muted?'Unmute account':'Mute account'}</DropdownMenuItem>
  <DropdownMenuItem disabled={!user||!state||busy} onSelect={()=>void change('block')}><UserX className="h-4 w-4 mr-2"/>{state?.blocked?'Unblock account':'Block account'}</DropdownMenuItem>
  {postId&&<DropdownMenuItem onSelect={()=>start('post')}><Flag className="h-4 w-4 mr-2"/>Report post</DropdownMenuItem>}
  <DropdownMenuItem onSelect={()=>start('user')}><Flag className="h-4 w-4 mr-2"/>Report account</DropdownMenuItem>
 </>;
}

export function CommunityReportHost(){
 const {user}=useAuth(),{toast}=useToast();
 const [report,setReport]=useState<{kind:'post'|'user';target:string}|null>(null),[busy,setBusy]=useState(false),[reason,setReason]=useState(reasons[0]),[details,setDetails]=useState('');
 useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!detail?.target)return;setReason(reasons[0]);setDetails('');setReport(detail);};window.addEventListener(REPORT_REQUEST,open);return()=>window.removeEventListener(REPORT_REQUEST,open);},[]);
 const submit=async()=>{if(!user||!report||busy)return;setBusy(true);try{
  const {error}=await (supabase.rpc as any)('community_submit_report',{p_kind:report.kind,p_target:report.target,p_reason:reason,p_details:details.trim()});if(error)throw error;
  setReport(null);toast({title:'Report received',description:'Saved for review. Reporting does not automatically remove content.'});
 }catch{toast({title:"Couldn't submit your report",description:'Please retry. It has not been confirmed.',variant:'destructive'});}finally{setBusy(false);}};
 return <>
  <Dialog open={!!report} onOpenChange={v=>{if(!v&&!busy)setReport(null);}}><DialogContent onClick={e=>e.stopPropagation()}>
   <DialogTitle className="pr-10">Report {report?.kind==='post'?'post':'account'}</DialogTitle><DialogDescription>Help keep TradersHub safe. Choose the concern below. Your report is private and goes to the operator for review.</DialogDescription>
   <label className="text-sm">Reason<select className="block w-full rounded border bg-background p-2 mt-1" value={reason} onChange={e=>setReason(e.target.value)}>{reasons.map(r=><option key={r}>{r}</option>)}</select></label>
   <label className="text-sm">Additional context (optional)<textarea className="block w-full rounded border bg-background p-2 mt-1" maxLength={1000} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Explain the concern. Do not include passwords or private payment details."/></label>
   <Button disabled={busy} onClick={()=>void submit()}>{busy?'Submitting…':'Submit report'}</Button>
  </DialogContent></Dialog>
 </>;
}
