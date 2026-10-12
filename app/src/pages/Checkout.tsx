import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { paymentReferencePattern } from "@/lib/checkout";
import {useQuery} from '@tanstack/react-query';
type Order = {
  url: string;
  reference: string;
  accessCode: string | null;
  amount: number;
  currency: string;
  mode: string;
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
};
export default function Checkout() {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const plan: PaidPlan =
    params.get("plan") === "premium" ? "premium" : "premium_plus";
  const annual = params.get("cycle") === "annual",
    p = PLANS[plan],
    amount = annual ? p.annual : p.monthly;
  const { user, loading } = useAuth(),
    { refetch } = useProfile();
  const paymentStatus=useQuery({queryKey:['inline-billing-status',user?.id],queryFn:()=>continuaFetch<{enabled:boolean;inlineCheckout?:boolean}>('/billing/status'),enabled:!!user,staleTime:15000,refetchInterval:30000});
  const checkoutReady=paymentStatus.data?.enabled===true&&paymentStatus.data?.inlineCheckout===true;
  const [method, setMethod] = useState<"mobile_money" | "card">("mobile_money");
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(1),
    [error, setError] = useState("");
  const [order, setOrder] = useState<Order | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const inFlight = useRef(false),
    reference = params.get("reference");
  async function verify(ref: string) {
    if (!paymentReferencePattern.test(ref)) {
      setError("Invalid payment reference.");
      return;
    }
    setBusy(true);
    setError("");
    setStep(3);
    try {
      const result = await continuaFetch<Receipt>(
        `/billing/verify/${encodeURIComponent(ref)}`,
      );
      setReceipt(result);
      if (result.mode === "live" && result.status === "paid") await refetch();
    } catch {
      setError(
        "Payment verification is unavailable. Check again before paying again.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  useEffect(() => {
    if (user && reference && !order) void verify(reference);
  }, [user?.id, reference]);
  async function pay() {
    if (inFlight.current || !user || !accepted || !checkoutReady) return;
    if (reference) {
      await verify(reference);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { default: Paystack } = await import("@paystack/inline-js");
      const data = await continuaFetch<Order>("/billing/checkout", {
        method: "POST",
        body: {
          plan,
          cycle: annual ? "annual" : "monthly",
          policyVersion: LEGAL_POLICY_VERSION,
          accepted: true,
          paymentMethod: method,
        },
      });
      if (
        data.mode !== "live" ||
        !paymentReferencePattern.test(data.reference) ||
        data.amount !== amount ||
        data.currency !== "KES" ||
        !data.accessCode
      )
        throw new Error(
          "Secure checkout could not start. No payment has been taken.",
        );
      setOrder(data);
      setParams(
        (current) => {
          current.set("reference", data.reference);
          return current;
        },
        { replace: true },
      );
      setStep(2);
      new Paystack().resumeTransaction(data.accessCode, {
        onSuccess: () => void verify(data.reference),
        onCancel: () => {
          setBusy(false);
          inFlight.current = false;
          setError(
            "Payment window closed. Check payment status before starting another payment.",
          );
        },
        onError: () => {
          setBusy(false);
          inFlight.current = false;
          setError(
            "Paystack could not load. Check this payment before trying again.",
          );
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout could not start.");
      setBusy(false);
      inFlight.current = false;
    }
  }
  const paid = receipt?.mode === "live" && receipt.status === "paid";
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
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-5 py-4">
          <Logo />
          <Link to="/upgrade" className="text-sm text-muted-foreground">
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
            onClick={() => navigate("/upgrade")}
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
                {i + 1}
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
                  KES {amount.toLocaleString()}
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
                  One payment. No automatic renewal.
                </p>
              </div>
            </div>
          </section>
          <section className="space-y-5">
            {paid ? (
              <>
                <ShieldCheck className="size-12 text-bull" />
                <h2 className="text-2xl font-semibold">Payment confirmed</h2>
                <p>{confirmedPlan?.name ?? 'Your membership'} is ready to use.</p>
                <p className="text-sm">Verified payment: {receipt.currency} {receipt.amount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">
                  Receipt {receipt.receiptNumber} · Access through{" "}
                  {receipt.expiresAt
                    ? new Date(receipt.expiresAt).toLocaleDateString()
                    : "your membership expiry"}
                  .
                </p>
                <Button className="w-full" onClick={() => navigate("/engine")}>
                  Open Continua
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Choose payment method</h2>
                <fieldset className="space-y-3" disabled={busy || !!reference}>
                  <legend className="sr-only">Payment method</legend>
                  {(["mobile_money", "card"] as const).map((value) => (
                    <label
                      key={value}
                      className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer ${method === value ? "border-primary bg-primary/[.03]" : "border-border"}`}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        value={value}
                        checked={method === value}
                        onChange={() => setMethod(value)}
                      />
                      {value === "card" ? (
                        <CreditCard className="text-primary" />
                      ) : (
                        <Smartphone className="text-bull" />
                      )}
                      <span className="text-sm font-semibold">
                        {value === "card" ? "Debit or credit card" : "M-PESA"}
                        <span className="block text-xs font-normal text-muted-foreground mt-1">
                          {value === "card"
                            ? "Card details stay with Paystack"
                            : "Use your registered mobile money account"}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="text-xs text-muted-foreground">
                  {method === "card"
                    ? "Enter card details only in the secure Paystack window. Continua never stores your card or CVV."
                    : "Paystack will securely request your M-PESA number and payment approval."}
                </p>
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
                    . One payment of KES {amount.toLocaleString()}, no automatic
                    renewal. Tier switches have no automatic prorated credit.
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
                ) : (
                  <Button
                    className="w-full"
                    disabled={loading || busy || (!reference && (!accepted || !checkoutReady))}
                    onClick={() =>
                      reference ? void verify(reference) : void pay()
                    }
                  >
                    {busy ? (
                      <>
                        <Loader2 className="animate-spin" />{" "}
                        {step === 3
                          ? "Verifying payment…"
                          : "Opening secure payment…"}
                      </>
                    ) : reference ? (
                      "Check payment status"
                    ) : (
                      `Pay KES ${amount.toLocaleString()}`
                    )}
                  </Button>
                )}
                {reference && !busy && (
                  <p className="text-xs text-muted-foreground">
                    {receipt?.status === "pending"
                      ? "Your payment is pending. "
                      : ""}
                    Do not pay again until this payment has been checked.
                  </p>
                )}
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
