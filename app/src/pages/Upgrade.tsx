import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { continuaFetch } from "@/api/client";
import { PLANS, type PaidPlan } from "@/lib/subscription";
import { navigateBack } from "@/lib/navigation";

const freeFeatures = ["Portfolio tracking, watchlists and charts", "TradersHub posts, media and discussions", "Fundamentals: 5 distinct stocks per month, with free revisits", "Basic ratings, forecast summaries and return on capital", "3 AI theses per month"];
export default function Upgrade() {
  const navigate=useNavigate();
  const {user}=useAuth(), {profile}=useProfile();
  const [params,setParams]=useSearchParams();
  const reference=params.get("reference");
  const paymentStatus=useQuery({queryKey:["billing-status",user?.id],enabled:!!user,queryFn:()=>continuaFetch<{enabled:boolean;mode:string}>("/billing/status"),retry:false});
  const [receipt,setReceipt]=useState<{status:string;amount:number;currency:string}|null>(null);
  const [verificationError,setVerificationError]=useState("");
  const [verifyAttempt,setVerifyAttempt]=useState(0);
  useEffect(()=>{
    if(!user||!reference)return;
    if(!/^continua-test-[0-9a-f-]{36}$/.test(reference)){setVerificationError("Invalid checkout reference.");return;}
    let cancelled=false;
    setVerificationError("");
    void continuaFetch<{status:string;amount:number;currency:string}>(`/billing/verify/${encodeURIComponent(reference)}`).then(data=>{if(!cancelled)setReceipt(data);}).catch(()=>{if(!cancelled)setVerificationError("We couldn't verify this test payment yet. You can safely retry verification.");});
    return()=>{cancelled=true;};
  },[user,reference,verifyAttempt]);
  const {toast}=useToast();
  const [annual,setAnnual]=useState(false);
  const [busy,setBusy]=useState<PaidPlan|null>(null);
  const current=profile?.subscription_plan??"free";
  const testCheckout=paymentStatus.data?.enabled===true&&paymentStatus.data.mode==='test';
  const upgrade=async(plan:PaidPlan)=>{
    if (!user) {navigate("/auth");return;}
    if(!paymentStatus.data?.enabled){toast({title:"Checkout is not available yet",description:"Payment setup is still in progress. No payment has been taken."});return;}
    setBusy(plan);
    try {
      const data=await continuaFetch<{url:string;mode:string}>("/billing/checkout",{method:"POST",body:{plan,cycle:annual?"annual":"monthly"}});
      const target=new URL(data.url);
      if(data.mode!=="test"||target.origin!=="https://checkout.paystack.com"||target.username||target.password)throw new Error("Invalid checkout link. No payment has been taken.");
      window.location.assign(target.href);
    }catch(error){toast({title:"Upgrade not completed",description:error instanceof Error?error.message:"Please try again.",variant:"destructive"});}
    finally{setBusy(null);}
  };
  return <div className="min-h-screen bg-background pb-24">
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b"><div className="flex items-center gap-3 px-4 py-3"><Button variant="ghost" size="icon" aria-label="Back" onClick={()=>navigateBack(navigate,"/profile")}><ArrowLeft/></Button><h1 className="text-lg font-bold">Choose your Continua plan</h1></div></header>
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-7">
      <div className="text-center space-y-3"><Crown className="mx-auto text-primary"/><h2 className="text-2xl font-semibold">Start simple. Research more deeply.</h2><p className="text-sm text-muted-foreground">Free keeps the essentials. Premium expands stock research. Premium Plus unlocks the whole Engine.</p></div>
      {paymentStatus.data?.enabled&&<section className="rounded-xl border p-4 text-sm" role="status"><strong>Paystack test checkout</strong><p>Use test payment details only. This does not charge real money or change your membership. Automatic renewals are not enabled.</p></section>}
      {reference&&<section className="rounded-xl border p-4 space-y-3" aria-live="polite"><h3 className="font-semibold">Test payment verification</h3><p className="text-sm">{verificationError|| (receipt?.status==='paid'?`Test payment confirmed: ${receipt.currency} ${receipt.amount.toLocaleString()}. Your real membership has not changed.`:receipt?'Payment is still pending. No membership change has been made.':'Checking your test payment…')}</p>{(verificationError||receipt?.status==='pending')&&<Button variant="outline" onClick={()=>setVerifyAttempt(v=>v+1)}>Retry verification</Button>}<Button variant="ghost" onClick={()=>{setParams({},{replace:true});setReceipt(null);}}>Close</Button></section>}
      <div className="flex justify-center gap-2" aria-label="Billing cycle">{[false,true].map(v=><button key={String(v)} aria-pressed={annual===v} onClick={()=>setAnnual(v)} className={`rounded-full px-5 py-3 text-sm ${annual===v?'bg-primary text-primary-foreground':'bg-muted'}`}>{v?'Annual · save 17%':'Monthly'}</button>)}</div>
      <div className="grid gap-5 md:grid-cols-3">
        <section className="rounded-2xl border p-5 space-y-5"><h3 className="text-xl font-semibold">Free</h3><p className="text-3xl font-bold">KES 0</p><FeatureList values={freeFeatures}/><Button variant="outline" className="w-full" onClick={()=>navigate(user?'/markets':'/auth')}>{current==='free'?'Current plan':'Explore Free'}</Button></section>
        {(Object.keys(PLANS) as PaidPlan[]).map(plan=>{
          const p=PLANS[plan], amount=annual?p.annual:p.monthly;
          const active=current===plan;
          return <section key={plan} className={`rounded-2xl border p-5 space-y-5 ${plan==='premium_plus'?'border-primary bg-primary/5':''}`}><h3 className="text-xl font-semibold">{p.name}</h3><div><p className="text-3xl font-bold tabular-nums">KES {(annual?amount/12:amount).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/month</span></p>{annual&&<p className="mt-2 text-xs text-muted-foreground">Billed KES {amount.toLocaleString()} once a year</p>}</div><FeatureList values={p.features}/><Button variant={plan==='premium_plus'?'default':'outline'} className="w-full" disabled={!!busy||(!testCheckout&&(active||current==='premium_plus'))} onClick={()=>void upgrade(plan)}>{busy===plan?<Loader2 className="animate-spin"/>:testCheckout?`Test ${p.name} checkout`:active?'Current plan':current==='premium_plus'?'Included in your plan':`Choose ${p.name}`}</Button></section>;
        })}
      </div>
      <section className="rounded-xl bg-muted/40 p-5 space-y-3"><h3 className="font-semibold">A clear distinction</h3><p className="text-sm text-muted-foreground">Premium includes detailed stock research, unlimited Fundamentals, advanced portfolio analysis, long-form posts and ad-free access. Its Engine access includes Briefing, Forecast, News, Earnings & Reports, Valuation, Ownership and Evidence. All expanded Fundamentals Forecast research is included. Premium Plus adds technical analysis, scenario labs, peers and personal workspace tools. Ask Engine still has fair-use and safety limits, which are shown in the tool.</p><p className="text-xs text-muted-foreground">Premium Plus: KES 1,000 × 12, less 17% = KES 9,960 per year. Existing Premium pricing remains KES 800/month or KES 7,980/year. Availability depends on verified source coverage; a subscription cannot supply missing filings.</p></section>
    </main>
  </div>;
}
function FeatureList({values}:{values:readonly string[]}){return <ul className="space-y-3">{values.map(v=><li key={v} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>{v}</li>)}</ul>;}
