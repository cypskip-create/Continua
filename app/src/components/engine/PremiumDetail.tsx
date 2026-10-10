import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useExchange } from "@/hooks/useExchange";
import { engineApi } from "@/api/engineApi";
import { engineReadRetry } from "@/api/engineRetry";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FundamentalDetail } from "@/components/stock/FundamentalDetail";

/** A locked request opens an upgrade prompt, never the research view or its hooks. */
export function PremiumDetail({title,symbol,currency="KES",children}: {title:string;symbol:string;currency?:string;children:ReactNode}) {
  const [requested,setRequested]=useState(false);
  const {user}=useAuth();const {profile,loading}=useProfile();const {exchange}=useExchange();
  const paid=["premium","premium_plus"].includes(profile?.subscription_plan??"");
  const access=useQuery({queryKey:["continua","research-access",user?.id,profile?.subscription_plan,exchange,symbol],queryFn:()=>engineApi.researchAccess(symbol,exchange),enabled:requested&&paid&&!!user&&!loading,staleTime:60_000,retry:engineReadRetry});
  const allowed=requested&&paid&&!!user&&!loading&&access.data?.allowed===true&&!access.isError;
  const checking=loading||(paid&&!!user&&access.isPending);
  return <><button type="button" aria-label={`Expand ${title}`} onClick={()=>setRequested(true)} className="inline-flex items-center gap-2 rounded-full border border-primary/25 px-4 py-2.5 text-sm font-semibold text-primary">{!paid&&<LockKeyhole size={14}/>} Detailed Research {!paid&&<span className="text-xs">· Premium</span>}<span aria-hidden="true">›</span></button>
    <Dialog open={requested&&!allowed} onOpenChange={setRequested}><DialogContent className="max-w-sm"><DialogTitle>{checking?"Checking Engine access":"Unlock Premium research"}</DialogTitle><DialogDescription>{checking?"Verifying your subscription before opening this tool.":`Basic summaries remain free. ${title} adds the detailed Engine workbench with evidence, controls and source limitations.`}</DialogDescription>{!checking&&<><div className="space-y-2 rounded-xl bg-primary/5 p-4" aria-hidden="true"><div className="h-3 w-3/4 rounded bg-muted blur-[2px]"/><div className="h-3 w-1/2 rounded bg-muted blur-[2px]"/></div>{paid&&access.isError&&<p role="alert" className="text-sm">Engine access could not be verified. No Premium research has been opened.</p>}<Link to="/upgrade" className="rounded-full bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground" onClick={()=>setRequested(false)}>Upgrade to unlock Engine</Link>{paid&&access.isError&&<button className="text-sm text-primary" onClick={()=>void access.refetch()}>Retry access check</button>}</>}</DialogContent></Dialog>
    {allowed&&<FundamentalDetail title={title} symbol={symbol} currency={currency} open onOpenChange={setRequested}><p className="py-3 text-xs font-semibold text-primary">CONTINUA ENGINE · PREMIUM WORKBENCH</p>{children}</FundamentalDetail>}
  </>;
}
