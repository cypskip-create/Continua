import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, type PaidPlan } from "@/lib/subscription";
import { navigateBack } from "@/lib/navigation";

const freeFeatures = ["Portfolio tracking, watchlists and charts", "TradersHub posts, media and discussions", "Fundamentals: 5 distinct stocks per month, with free revisits", "Basic ratings, forecast summaries and return on capital", "3 AI theses per month"];
export default function Upgrade() {
  const navigate=useNavigate();
  const {user}=useAuth(), {profile,refetch}=useProfile();
  const {methods}=usePaymentMethods();
  const {toast}=useToast();
  const [annual,setAnnual]=useState(false);
  const [busy,setBusy]=useState<PaidPlan|null>(null);
  const current=profile?.subscription_plan??"free";
  const upgrade=async(plan:PaidPlan)=>{
    if (!user) {navigate("/auth");return;}
    if(!methods.length){toast({title:"Add a payment method",description:"Add M-Pesa or a card in Settings first."});navigate("/settings",{state:{section:"payment"}});return;}
    setBusy(plan);
    try {
      const {data,error}=await supabase.functions.invoke("upgrade-subscription",{body:{plan,billingCycle:annual?"yearly":"monthly"}});
      if(error||data?.error)throw new Error(data?.error||"Checkout is unavailable. Please try again later.");
      await refetch?.();
      toast({title:data?.mock?"Test membership updated":`Welcome to ${PLANS[plan].name}`,description:data?.mock?"Test checkout only. No payment was taken.":"Your payment and membership have been confirmed."});
    }catch(error){toast({title:"Upgrade not completed",description:error instanceof Error?error.message:"Please try again.",variant:"destructive"});}
    finally{setBusy(null);}
  };
  return <div className="min-h-screen bg-background pb-24">
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b"><div className="flex items-center gap-3 px-4 py-3"><Button variant="ghost" size="icon" aria-label="Back" onClick={()=>navigateBack(navigate,"/profile")}><ArrowLeft/></Button><h1 className="text-lg font-bold">Choose your Continua plan</h1></div></header>
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-7">
      <div className="text-center space-y-3"><Crown className="mx-auto text-primary"/><h2 className="text-2xl font-semibold">Start simple. Research more deeply.</h2><p className="text-sm text-muted-foreground">Free keeps the essentials. Premium expands stock research. Premium Plus unlocks the whole Engine.</p></div>
      <div className="flex justify-center gap-2" aria-label="Billing cycle">{[false,true].map(v=><button key={String(v)} aria-pressed={annual===v} onClick={()=>setAnnual(v)} className={`rounded-full px-5 py-3 text-sm ${annual===v?'bg-primary text-primary-foreground':'bg-muted'}`}>{v?'Annual · save 17%':'Monthly'}</button>)}</div>
      <div className="grid gap-5 md:grid-cols-3">
        <section className="rounded-2xl border p-5 space-y-5"><h3 className="text-xl font-semibold">Free</h3><p className="text-3xl font-bold">KES 0</p><FeatureList values={freeFeatures}/><Button variant="outline" className="w-full" onClick={()=>navigate(user?'/markets':'/auth')}>{current==='free'?'Current plan':'Explore Free'}</Button></section>
        {(Object.keys(PLANS) as PaidPlan[]).map(plan=>{
          const p=PLANS[plan], amount=annual?p.annual:p.monthly;
          const active=current===plan;
          return <section key={plan} className={`rounded-2xl border p-5 space-y-5 ${plan==='premium_plus'?'border-primary bg-primary/5':''}`}><h3 className="text-xl font-semibold">{p.name}</h3><div><p className="text-3xl font-bold tabular-nums">KES {(annual?amount/12:amount).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/month</span></p>{annual&&<p className="mt-2 text-xs text-muted-foreground">Billed KES {amount.toLocaleString()} once a year</p>}</div><FeatureList values={p.features}/><Button variant={plan==='premium_plus'?'default':'outline'} className="w-full" disabled={!!busy||active||current==='premium_plus'} onClick={()=>void upgrade(plan)}>{busy===plan?<Loader2 className="animate-spin"/>:active?'Current plan':current==='premium_plus'?'Included in your plan':`Choose ${p.name}`}</Button></section>;
        })}
      </div>
      <section className="rounded-xl bg-muted/40 p-5 space-y-3"><h3 className="font-semibold">A clear distinction</h3><p className="text-sm text-muted-foreground">Premium includes detailed stock research, unlimited Fundamentals, advanced portfolio analysis, long-form posts and ad-free access. Its Engine access is limited to Briefing and basic Forecast. Premium Plus adds all Engine company research, analysis and workspace tools. Ask Engine still has fair-use and safety limits, which are shown in the tool.</p><p className="text-xs text-muted-foreground">Premium Plus: KES 1,000 × 12, less 17% = KES 9,960 per year. Existing Premium pricing remains KES 800/month or KES 7,980/year. Availability depends on verified source coverage; a subscription cannot supply missing filings.</p></section>
    </main>
  </div>;
}
function FeatureList({values}:{values:readonly string[]}){return <ul className="space-y-3">{values.map(v=><li key={v} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{v}</li>)}</ul>;}
