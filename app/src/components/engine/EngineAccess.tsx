import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useExchange } from "@/hooks/useExchange";
import { engineApi } from "@/api/engineApi";
import { engineReadRetry } from "@/api/engineRetry";

export function EnginePreview({ symbol }: { symbol: string }) {
  return <section className="my-4 overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-label="Locked Engine Forecast preview">
    <p className="flex items-center gap-2 text-xs font-semibold text-primary"><Zap size={16}/> CONTINUA ENGINE · PREMIUM</p>
    <h3 className="mt-3 text-xl font-semibold">Go deeper with Engine research.</h3>
    <p className="mt-2 text-sm text-muted-foreground">Basic ratings and forecast charts remain free. Unlock model inputs, rating-band sensitivity, financial evidence and adjustable price scenarios.</p>
    <div className="mt-4 grid grid-cols-2 gap-3" aria-hidden="true">{["Rating research","Model inputs","Financial evidence","Price sensitivity"].map(title=><div key={title} className="rounded-xl border border-border bg-background/70 p-3"><p className="text-xs font-semibold">{title}</p><div className="mt-3 h-2 w-3/4 rounded bg-muted blur-[2px]"/><div className="mt-2 h-2 w-1/2 rounded bg-muted blur-[2px]"/></div>)}</div>
    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole size={14}/> Preview only. No locked analysis is loaded.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Link className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground" to="/upgrade">Unlock Continua Engine</Link><Link className="py-2.5 text-sm font-semibold text-primary" to={`/engine?symbol=${encodeURIComponent(symbol)}&tool=Forecast`}>Explore Engine →</Link></div>
  </section>;
}

/** Do not mount analysis children until the subscriber API confirms access. */
export function EngineAccess({symbol,children}: {symbol:string;children:ReactNode}) {
  const {profile,loading}=useProfile();
  const {user}=useAuth();
  const {exchange}=useExchange();
  const paid=["premium","premium_plus"].includes(profile?.subscription_plan??"");
  const query=useQuery({queryKey:["continua","engine",user?.id,exchange,symbol],queryFn:()=>engineApi.get(symbol,exchange),enabled:paid&&!!user&&!loading,staleTime:60_000,retry:engineReadRetry});
  if(loading || (paid&&query.isLoading)) return <p role="status" className="py-6 text-sm text-muted-foreground">Checking Engine access…</p>;
  if(!paid || !user) return <EnginePreview symbol={symbol}/>;
  if(query.isError || !query.data) return <section className="py-6 space-y-3"><p role="alert" className="text-sm text-muted-foreground">Engine access could not be verified. Your reported financials remain available.</p><button className="text-sm font-semibold text-primary" onClick={()=>void query.refetch()}>Retry Engine access</button></section>;
  return <>{children}</>;
}
