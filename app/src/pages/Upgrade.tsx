import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Crown, Sparkles, Zap, LineChart, Users, Bell, ShieldCheck,
  FileText, BarChart3, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Benchmarked against Simply Wall St (~$10/mo), Moomoo (freemium+tiered),
// Seeking Alpha ($4.95 first month → $239/yr), Robinhood Gold ($5/mo).
// Kenya pricing anchored to income parity and typical local SaaS pricing.
const FREE_FEATURES = [
  "Watchlists & delayed prices",
  "TradersHub — read & post (up to 500 characters)",
  "Basic charts (line, area, candlestick)",
  "3 AI theses / month",
  "Full stock research on 5 different stocks / month",
  "Basic portfolio valuation (pick one model per holding)",
];

const PREMIUM_FEATURES = [
  { icon: LineChart, label: "Real-time NSE prices", detail: "No delay — prices update the moment they move" },
  { icon: Sparkles, label: "Unlimited AI investment theses", detail: "Free is capped at 3/month" },
  { icon: FileText, label: "Unlimited stock research", detail: "Free is capped at 5 different stocks/month" },
  { icon: ShieldCheck, label: "Investment Health Score on every stock", detail: "AfriScore breakdown, not just the headline number" },
  { icon: BarChart3, label: "Advanced screener & compare", detail: "Dividend yield, beta, RSI, and market-cap filters" },
  { icon: LineChart, label: "Portfolio Analysis", detail: "Benchmarks vs. the NSE index, diversification, correlation, and risk — the whole Analysis tab" },
  { icon: BarChart3, label: "Consensus Portfolio Valuation", detail: "Averages all 3 real valuation models per holding, instead of picking just one" },
  { icon: ShieldCheck, label: "Dividend Quality breakdown", detail: "Per-holding reliability scores and income-by-tier, not just the summary" },
  { icon: Bell, label: "Priority price / earnings alerts", detail: "Delivered first, before free-tier alerts" },
  { icon: FileText, label: "Long-form TradersHub posts", detail: "Write up to 5,000 characters — full articles, not just quick takes" },
  { icon: Zap, label: "Ad-free", detail: "" },
];

export default function Upgrade() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, refetch } = useProfile();
  const { methods: paymentMethods } = usePaymentMethods();
  const { toast } = useToast();
  const [annual, setAnnual] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const isPremium = profile?.subscription_plan === "premium" || profile?.subscription_plan === "premium_plus";

  // Monthly is KES 800. Yearly is billed as a single KES 7,980 charge, which works out
  // to KES 665/mo — a 17% discount off the monthly rate.
  const monthly = 800;
  const yearlyMonthlyEquivalent = 665;
  const yearly = yearlyMonthlyEquivalent * 12; // 7,980
  const savingsPct = Math.round((1 - yearlyMonthlyEquivalent / monthly) * 100);
  const priceLabel = annual ? `KES ${yearly.toLocaleString()}` : `KES ${monthly.toLocaleString()}`;
  const periodLabel = annual ? "/year" : "/month";
  const subLabel = annual ? `KES ${yearlyMonthlyEquivalent}/mo, billed yearly` : "Cancel anytime";

  const handleUpgrade = async () => {
    if (!user) { navigate("/auth"); return; }
    if (paymentMethods.length === 0) {
      toast({ title: "Add a payment method first", description: "Add M-Pesa or a card to complete your upgrade." });
      navigate("/settings", { state: { section: "payment" } });
      return;
    }
    setUpgrading(true);
    const { data, error } = await supabase.functions.invoke("upgrade-subscription", {
      body: { plan: "premium", billingCycle: annual ? "yearly" : "monthly" },
    });
    setUpgrading(false);

    if (error || data?.error) {
      toast({ title: "Upgrade failed", description: data?.error || "Please try again.", variant: "destructive" });
      return;
    }

    await refetch?.();
    toast({
      title: "Welcome to Premium",
      description: annual ? `You're billed KES ${yearly.toLocaleString()}/year.` : `You're billed KES ${monthly.toLocaleString()}/month.`,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Continua Premium</h1>
        </div>
      </header>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-2xl brand-active flex items-center justify-center">
            <Crown className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold">
            {isPremium ? "You're on Premium" : "Invest with the full picture"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {isPremium
              ? "Thanks for backing Continua — here's everything included in your plan."
              : "Real-time prices, unlimited AI research, and long-form TradersHub posts."}
          </p>
        </div>

        {!isPremium && (
          <>
            {/* Billing toggle */}
            <div className="flex justify-center">
              <div className="inline-flex items-center rounded-full bg-muted p-0.5">
                <button
                  data-small-target
                  onClick={() => setAnnual(false)}
                  className={`text-xs font-semibold rounded-full px-4 py-1.5 transition-colors ${!annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                >Monthly</button>
                <button
                  data-small-target
                  onClick={() => setAnnual(true)}
                  className={`text-xs font-semibold rounded-full px-4 py-1.5 transition-colors ${annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                >Yearly · save {savingsPct}%</button>
              </div>
            </div>

            {/* Price */}
            <div className="text-center">
              <p className="text-4xl font-bold tabular">{priceLabel}<span className="text-base text-muted-foreground font-normal">{periodLabel}</span></p>
              <p className="text-xs text-muted-foreground mt-1">{subLabel}</p>
            </div>

            <Button className="btn-primary w-full h-12 text-sm" onClick={handleUpgrade} disabled={upgrading}>
              {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Premium"}
            </Button>
            {paymentMethods.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center -mt-4">You'll be asked to add M-Pesa or a card first.</p>
            )}
          </>
        )}

        {/* Feature comparison */}
        <div>
          <p className="section-eyebrow mb-3">What you get</p>
          <div className="space-y-2.5">
            {PREMIUM_FEATURES.map(f => (
              <div key={f.label} className="flex items-start gap-3 p-3 rounded-xl border border-border/60">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <f.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{f.label}</p>
                  {f.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{f.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Free tier reminder */}
        <div>
          <p className="section-eyebrow mb-3">Still on Free? You keep</p>
          <ul className="space-y-1.5">
            {FREE_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />{f}
              </li>
            ))}
          </ul>
        </div>

        {!isPremium && (
          <Button className="btn-primary w-full h-12 text-sm" onClick={handleUpgrade} disabled={upgrading}>
            {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Upgrade to Premium — ${priceLabel}${periodLabel}`}
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Users className="h-3 w-3" />
          Priced for the Kenyan market — cancel anytime from Account.
        </p>
      </div>
    </div>
  );
}