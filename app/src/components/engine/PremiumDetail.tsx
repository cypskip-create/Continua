import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FundamentalDetail } from "@/components/stock/FundamentalDetail";
import { researchAccessState } from '@/lib/accountAccess';

/** A locked request opens an upgrade prompt, never the research view or its hooks. */
export function PremiumDetail({title,symbol,currency="KES",children}: {title:string;symbol:string;currency?:string;children:ReactNode}) {
  const [requested,setRequested]=useState(false);
  const {user}=useAuth();const {profile,loading,error,refetch}=useProfile();
  const state=researchAccessState({signedIn:!!user,loading,hasProfile:!!profile,plan:profile?.subscription_plan,expiresAt:profile?.subscription_expires_at,error});
  const paid=state==='paid';
  const allowed=requested&&paid;
  const checking=state==='loading';
  const unavailable=state==='unavailable';
  return <><button type="button" aria-label={`Expand ${title}`} onClick={()=>setRequested(true)} className="inline-flex items-center gap-2 rounded-full border border-primary/25 px-4 py-2.5 text-sm font-semibold text-primary">{state==='free'&&<LockKeyhole size={14}/>} Detailed Research {state==='free'&&<span className="text-xs">· Premium</span>}<span aria-hidden="true">›</span></button>
    <Dialog open={requested&&!allowed} onOpenChange={setRequested}><DialogContent className="max-w-sm"><DialogTitle>{checking?"Loading your account":unavailable?"Account temporarily unavailable":"Unlock Premium research"}</DialogTitle><DialogDescription>{checking?"Your account is loading. Please wait a moment.":unavailable?"We couldn't load your subscription. This does not mean your paid access has ended.":`Basic summaries remain free. ${title} adds the detailed Engine workbench with evidence, controls and source limitations.`}</DialogDescription>{!checking&&(unavailable?<button className="text-sm text-primary" onClick={()=>void refetch()}>Retry account connection</button>:<Link to="/upgrade" className="rounded-full bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground" onClick={()=>setRequested(false)}>Upgrade to unlock Engine</Link>)}</DialogContent></Dialog>
    {allowed&&<FundamentalDetail title={title} symbol={symbol} currency={currency} open onOpenChange={setRequested}><p className="py-3 text-xs font-semibold text-primary">CONTINUA ENGINE · PREMIUM WORKBENCH</p>{children}</FundamentalDetail>}
  </>;
}
