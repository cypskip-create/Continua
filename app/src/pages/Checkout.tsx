import { RollingNumber } from "@/components/shared/RollingNumber";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Crown,
  CreditCard,
  Smartphone,
  ShieldCheck,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { continuaFetch } from "@/api/client";
import { PLANS, type PaidPlan } from "@/lib/subscription";
import { LEGAL_POLICY_VERSION } from "@/lib/legalPolicy";
import { paymentReferencePattern, validKenyanMobile, checkoutBackTarget } from "@/lib/checkout";
import {useQuery} from '@tanstack/react-query';
type Order = {
  reference: string;
  accessCode: string | null;
  amount: number;
  currency: string;
  mode: string;
  plan:PaidPlan;
  cycle:'monthly'|'annual';
  status: string;
  paymentMethod: 'mpesa'|'airtel'|'card';
  authorizationDeadline: string|null;
};
type Receipt = {
  status: string;
  mode: string;
  plan: PaidPlan;
  cycle: string;
  amount: number;
  currency: string;
  expiresAt?: string;
  receiptNumber?: string;
  accessCode?:string|null;
  paymentMethod?:'mpesa'|'airtel'|'card';
};
export default function Checkout() {
  const location=useLocation();
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const plan: PaidPlan =
    params.get("plan") === "premium" ? "premium" : "premium_plus";
  const annual = params.get("cycle") === "annual",
    p = PLANS[plan],
    amount = annual ? p.annual : p.monthly;
  const { user, loading } = useAuth(),
    { refetch } = useProfile();
  const paymentStatus=useQuery({queryKey:['inline-billing-status',user?.id],queryFn:()=>continuaFetch<{nativeCheckout?:boolean;nativeMode?:string;automaticRenewal?:boolean}>('/billing/status'),enabled:!!user,staleTime:15000,refetchInterval:30000});
  const checkoutReady=paymentStatus.data?.nativeCheckout===true;
  const [method, setMethod] = useState<'mpesa'|'airtel'|'card'>('mpesa');
  const [phone,setPhone]=useState('');
  const [autoRenew,setAutoRenew]=useState(false);
  const renewal=useQuery({queryKey:['card-renewal',user?.id],queryFn:()=>continuaFetch<{enabled:boolean;processing:boolean;nextChargeAt:string}|null>('/billing/renewal'),enabled:!!user&&paymentStatus.data?.nativeCheckout===true});
  const [timedOut,setTimedOut]=useState(false);
  const [cardOpen,setCardOpen]=useState(false);
  const intent=useRef<string | null>(null);
  const verifying=useRef(false);
  const currentUser=useRef(user?.id);
  currentUser.current=user?.id;
  const previousUser=useRef(user?.id);
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(1),
    [error, setError] = useState("");
  const [order, setOrder] = useState<Order | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const inFlight = useRef(false),
    reference = params.get("reference");
  useEffect(()=>{
    if(previousUser.current&&previousUser.current!==user?.id) {
      setOrder(null);setReceipt(null);setPhone('');setAccepted(false);setAutoRenew(false);setBusy(false);setError('');setStep(1);setCardOpen(false);
      inFlight.current=false;verifying.current=false;intent.current=null;
      setParams(p=>{p.delete('reference');return p;},{replace:true});
    }
    previousUser.current=user?.id;
  },[user?.id]);
  async function verify(ref: string) {
    if(verifying.current)return;
    if (!paymentReferencePattern.test(ref)) {
      setError("Invalid payment reference.");
      return;
    }
    verifying.current=true;
    const verifyingUser=user?.id;
    setBusy(true);
    setError("");
    setStep(3);
    try {
      const result = await continuaFetch<Receipt>(
        `/billing/native-verify/${encodeURIComponent(ref)}`,
      );
      if(currentUser.current!==verifyingUser)return;
      setReceipt(result);
      if(result.paymentMethod)setMethod(result.paymentMethod);
      setStep(result.status==='paid'?3:2);
      if (result.mode === "live" && result.status === "paid") await refetch();
      if(result.status==='paid')await renewal.refetch();
    } catch {
      if(currentUser.current!==verifyingUser)return;
      setError(
        "Payment verification is unavailable. Check again before paying again.",
      );
    } finally {
      if(currentUser.current===verifyingUser){setBusy(false);inFlight.current=false;verifying.current=false;}
    }
  }
  useEffect(() => {
    if (user && reference && !order) void verify(reference);
  }, [user?.id, reference]);
  useEffect(()=>{
    if(!user||!reference||receipt&&['paid','failed','abandoned','reversed'].includes(receipt.status))return;
    const deadline=order?.authorizationDeadline?Date.parse(order.authorizationDeadline):Date.now()+(method==='card'?600000:180000);
    const timer=window.setInterval(()=>{
      if(Date.now()>deadline){setTimedOut(true);window.clearInterval(timer);void verify(reference);return;}
      void verify(reference);
    },10000);
    return ()=>window.clearInterval(timer);
  },[user?.id,reference,receipt?.status,order?.authorizationDeadline]);
  async function pay() {
    if (inFlight.current || !user || !accepted || !checkoutReady) return;
    if (reference) {
      await verify(reference);
      return;
    }
    if(method!=='card'&&!validKenyanMobile(phone)){setError('Enter a valid Kenyan mobile number.');return;}
    inFlight.current = true;
    setBusy(true);
    setError("");
    const payingUser=user.id;
    try {
      intent.current??=crypto.randomUUID();
      const data = await continuaFetch<Order>("/billing/native-checkout", {
        method: "POST",
        body: {
          plan,
          cycle: annual ? "annual" : "monthly",
          policyVersion: LEGAL_POLICY_VERSION,
          accepted: true,
          paymentMethod: method,
          intentId:intent.current,
          autoRenew:method==='card'&&!annual&&autoRenew,
          ...(method!=='card'?{phone}:{}),
        },
      });
      if(currentUser.current!==payingUser)return;
      if (
        !['test','live'].includes(data.mode) ||
        !paymentReferencePattern.test(data.reference) ||
        !data.reference.startsWith(`continua-${data.mode}-`) ||
        !['premium','premium_plus'].includes(data.plan) ||
        !['monthly','annual'].includes(data.cycle) ||
        data.amount!==PLANS[data.plan][data.cycle==='annual'?'annual':'monthly'] ||
        data.currency !== "KES"
      )
        throw new Error(
          "Checkout could not be confirmed. Check payment status before trying again.",
        );
      setOrder(data);
      setMethod(data.paymentMethod);
      setParams(
        (current) => {
          current.set("reference", data.reference);
          current.set('plan',data.plan);current.set('cycle',data.cycle);
          return current;
        },
        { replace: true },
      );
      setStep(2);
      setTimedOut(false);
      if(data.paymentMethod!=='card'||!data.accessCode){setBusy(false);inFlight.current=false;return;}
      const { default: Paystack } = await import("@paystack/inline-js");
      setCardOpen(true);
      new Paystack().resumeTransaction(data.accessCode, {
        onSuccess: () => {setCardOpen(false);void verify(data.reference);},
        onCancel: () => {
          setCardOpen(false);
          setBusy(false);
          inFlight.current = false;
          setError(
            "Payment window closed. Check payment status before starting another payment.",
          );
        },
        onError: () => {
          setCardOpen(false);
          setBusy(false);
          inFlight.current = false;
          setError(
            "Paystack could not load. Check this payment before trying again.",
          );
        },
      });
    } catch (e) {
      if(currentUser.current!==payingUser)return;
      setError(e instanceof Error ? e.message : "Checkout could not start.");
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function resumeCard() {
    const accessCode=receipt?.accessCode??order?.accessCode;
    if(!reference||!accessCode||cardOpen||busy)return;
    setCardOpen(true);setError('');
    try {
      const {default:Paystack}=await import('@paystack/inline-js');
      new Paystack().resumeTransaction(accessCode,{
        onSuccess:()=>{setCardOpen(false);void verify(reference);},
        onCancel:()=>{setCardOpen(false);setError('Card window closed. You can resume this same payment safely.');},
        onError:()=>{setCardOpen(false);setError('Secure card window could not load. Check status before retrying.');},
      });
    }catch{setCardOpen(false);setError('Secure card window is unavailable. Check status before retrying.');}
  }
  const paid = receipt?.status === "paid";
  const confirmedPlan = receipt && PLANS[receipt.plan];
  function restartFailedPayment() {
    if (
      !receipt ||
      !["failed", "abandoned", "reversed"].includes(receipt.status)
    )
      return;
    setParams(
      (current) => {
        current.delete("reference");
        return current;
      },
      { replace: true },
    );
    setReceipt(null);
    setOrder(null);
    setAccepted(false);
    setStep(1);
    setError("");
    intent.current=null;
    setTimedOut(false);
  }
  const backToPlans=()=>{
    const target=checkoutBackTarget(window.history.state?.idx,location.state?.fromPlans===true);
    if(target===-1)navigate(-1);
    else navigate(target,{replace:true,state:{fromCheckout:true}});
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-5 py-4">
          <Logo />
          <Link to="/upgrade" onClick={event=>{event.preventDefault();backToPlans();}} className="text-sm text-muted-foreground">
            Back to plans
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8 md:py-12">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to plans"
            onClick={backToPlans}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Checkout</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete your payment to activate {p.name}
            </p>
          </div>
        </div>
        <ol aria-label="Checkout progress" className="grid grid-cols-3 my-8">
          {["Payment method", "Payment", "Confirmation"].map((label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className="text-center text-xs"
            >
              <span
                className={`mx-auto mb-2 grid size-8 place-items-center rounded-full ${step >= i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                <RollingNumber value={i + 1} />
              </span>
              {label}
            </li>
          ))}
        </ol>
        <div className="grid gap-8 md:grid-cols-2">
          <section className="rounded-3xl border border-primary/15 bg-primary/[.04] p-6 self-start">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-3 text-3xl font-semibold">
                  KES <RollingNumber value={amount.toLocaleString()} />
                  <span className="text-sm font-normal text-muted-foreground">
                    /{annual ? "year" : "month"}
                  </span>
                </p>
              </div>
              <Crown className="size-12 rounded-2xl p-3 bg-primary/10 text-primary" />
            </div>
            <ul className="space-y-4 my-6">
              {p.features.map((feature) => (
                <li key={feature} className="flex gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 border-t pt-4">
              <CalendarDays className="size-5 text-primary" />
              <div className="text-sm">
                {annual ? "One year" : "One month"} of access
                <p className="text-xs text-muted-foreground mt-1">
                  {autoRenew?'Monthly renewal requested for an eligible card.':'One payment. No automatic renewal.'}
                </p>
              </div>
            </div>
          </section>
          <section className="space-y-5">
            {paid ? (
              <>
                <ShieldCheck className="size-12 text-bull" />
                <h2 className="text-2xl font-semibold">{receipt.mode==='test'?'Test payment confirmed':'Payment confirmed'}</h2>
                <p>{receipt.mode==='test'?'Sandbox only. No real charge or paid access was created.':`${confirmedPlan?.name ?? 'Your membership'} is ready to use.`}</p>
                <p className="text-sm">Verified payment: {receipt.currency} <RollingNumber value={receipt.amount.toLocaleString()} /></p>
                {receipt.mode==='live'&&<p className="text-sm text-muted-foreground">
                  Receipt {receipt.receiptNumber} · Access through{" "}
                  {receipt.expiresAt
                    ? new Date(receipt.expiresAt).toLocaleDateString()
                    : "your membership expiry"}
                  .
                </p>}
                <Button className="w-full" onClick={() => navigate("/engine")}>
                  Open Continua
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Choose payment method</h2>
                {paymentStatus.data?.nativeMode==='test'&&<p role="status" className="text-sm text-primary">Test Mode — no real charge or membership activation.</p>}
                <fieldset className="space-y-3">
                  <legend className="sr-only">Payment method</legend>
                  {(['mpesa','airtel','card'] as const).map((value) => (
                    <div key={value} className="rounded-2xl border border-border overflow-hidden">
                    <label
                      className={`flex items-center gap-4 p-4 cursor-pointer ${method === value ? "bg-primary/[.03]" : ""}`}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        value={value}
                        checked={method === value}
                        disabled={busy||!!reference}
                        onChange={() => {setMethod(value);setAutoRenew(false);}}
                      />
                      {value === "card" ? (
                        <CreditCard className="text-primary" />
                      ) : (
                        <Smartphone className="text-bull" />
                      )}
                      <span className="text-sm font-semibold">
                        {value === "card" ? "Debit or credit card" : value==='airtel'?'Airtel Money':"M-PESA"}
                        <span className="block text-xs font-normal text-muted-foreground mt-1">
                          {value === "card"
                            ? "Card details stay with Paystack"
                            : "Use your registered mobile money account"}
                        </span>
                      </span>
                    </label>
                    <div className="payment-accordion" data-open={method===value} aria-hidden={method!==value}>
                      <div className="min-h-0 overflow-hidden">
                        <div className="px-4 pb-4 space-y-3">
                          {value==='card'?<><p className="text-xs text-muted-foreground">Paystack securely collects your card details, OTP and bank verification. Continua never asks for your card number, CVV or PIN.</p>
                            {!annual&&paymentStatus.data?.automaticRenewal&&<label className="flex gap-2 text-xs"><input type="checkbox" checked={autoRenew} disabled={busy||!!reference||method!==value} onChange={e=>setAutoRenew(e.target.checked)}/><span>Automatically renew monthly at KES <RollingNumber value={amount.toLocaleString()} /> with an eligible reusable card. Turn it off here before the next charge. Off by default.</span></label>}
                          </>:<>
                            <label className="block text-sm" htmlFor={`phone-${value}`}>{value==='mpesa'?'M-PESA':'Airtel Money'} phone number</label>
                            <input id={`phone-${value}`} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} placeholder="0712 345 678" value={phone} disabled={busy||!!reference||method!==value} onChange={e=>setPhone(e.target.value)} className="w-full rounded-xl border bg-background px-3 py-3 text-base" />
                            <p className="text-xs text-muted-foreground">Authorize on your phone. Enter your mobile-money PIN there, never on Continua.</p>
                          </>}
                          <Button className="w-full" disabled={method!==value||!user||loading||busy||(!reference&&(!accepted||!checkoutReady))} onClick={()=>reference?void verify(reference):void pay()}>
                            {busy?<><Loader2 className="animate-spin" />{step===3?'Verifying payment…':'Starting payment…'}</>:reference?'Check payment status':`Pay KES ${amount.toLocaleString()}`}
                          </Button>
                        </div>
                      </div>
                    </div>
                    </div>
                  ))}
                </fieldset>
                {reference&&<p role="status" aria-live="polite" className="text-sm text-muted-foreground">{timedOut?'Authorization is taking longer than expected. Check status; do not pay again until this attempt is resolved.':order?.status==='unknown'?'The initiation response was interrupted. Checking this payment automatically; do not start another.':receipt?.status==='pending'||!receipt?'Waiting for authorization. Checking payment automatically…':`Payment ${receipt.status}.`}</p>}
                <label className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={busy || !!reference}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    I agree to the{" "}
                    <Link
                      className="text-primary underline"
                      to="/billing-policy"
                    >
                      billing policy
                    </Link>{" "}
                    and{" "}
                    <Link className="text-primary underline" to="/terms">
                      Terms
                    </Link>
                    . <RollingNumber value={autoRenew?`KES ${amount.toLocaleString()} now and monthly after your paid term ends, only if Paystack confirms a reusable card. Otherwise renew manually.`:`One payment of KES ${amount.toLocaleString()}, no automatic renewal.`} /> Tier switches have no automatic prorated credit.
                  </span>
                </label>
                {!user && !loading ? (
                  <Button
                    className="w-full"
                    onClick={() =>
                      navigate("/auth", {
                        state: {
                          from: {
                            pathname: "/checkout",
                            search: window.location.search,
                          },
                        },
                      })
                    }
                  >
                    Log in to continue
                  </Button>
                ) : null}
                {reference && !busy && (
                  <p className="text-xs text-muted-foreground">
                    {receipt?.status === "pending"
                      ? "Your payment is pending. "
                      : ""}
                    Do not pay again until this payment has been checked.
                  </p>
                )}
                {reference&&method==='card'&&!paid&&(receipt?.accessCode||order?.accessCode)&&<Button variant="outline" className="w-full" disabled={busy||cardOpen} onClick={()=>void resumeCard()}>Resume secure card payment</Button>}
                {user && !reference && !checkoutReady && <p role="status" className="text-sm text-muted-foreground">{paymentStatus.isPending?'Checking payment availability…':'Secure checkout is temporarily unavailable. Please retry shortly.'}</p>}
                {receipt && ['failed', 'abandoned', 'reversed'].includes(receipt.status) && (
                  <Button variant="outline" className="w-full" onClick={restartFailedPayment}>Start a new checkout</Button>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {renewal.data?.enabled&&<div className="border-t pt-4 text-xs space-y-2"><p>Monthly card renewal is on. Next scheduled charge: {new Date(renewal.data.nextChargeAt).toLocaleDateString()}.{renewal.data.processing?' A payment already processing may still complete.':''}</p><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await continuaFetch('/billing/renewal',{method:'DELETE'});await renewal.refetch();}catch{setError('Could not turn off renewal. Please retry.');}finally{setBusy(false);}}}>Turn off automatic renewal</Button></div>}
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> Secure payment powered by{" "}
              <strong className="text-foreground">Paystack</strong>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
