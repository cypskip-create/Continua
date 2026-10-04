import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, Cell } from "recharts";
import { InfoTip } from "./InfoTip";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike { symbol: string; name?: string; shares: number }

interface DividendForecastProps {
  holdings: HoldingLike[];
  dividendData: Record<string, HoldingDividendData>;
  isPremium?: boolean;
  showValues?: boolean;
  currencyLabel?: string;
}

const FREE_MONTHLY_PERIODS = 1;
const FREE_ANNUAL_PERIODS = 1;

interface ForecastEvent {
  date: Date;
  symbol: string;
  name: string;
  amount: number;
  declared: boolean; // real, company-confirmed future date vs mechanically projected
}

/** Payments due this period from real, already-confirmed future ex/pay
 *  dates ("declared"), plus a mechanical projection beyond that
 *  ("estimated" — last known amount, repeated on the holding's own
 *  historical cadence, no growth assumed). */
export function DividendForecast({ holdings, dividendData, isPremium = false, showValues = true, currencyLabel = "KSh" }: DividendForecastProps) {
  const [view, setView] = useState<"monthly" | "annual">("monthly");

  const paymentEvents = useMemo(() => {
    const events: ForecastEvent[] = [];
    holdings.forEach((h) => {
      const d = dividendData[h.symbol.toUpperCase()];
      if (!d) return;
      const futurePayDates = d.payouts.filter((p) => p.payDate && new Date(p.payDate) > new Date());
      futurePayDates.forEach((p) => {
        if (!p.payDate) return;
        events.push({ date: new Date(p.payDate), symbol: h.symbol, name: h.name || h.symbol, amount: p.amountPerShare * h.shares, declared: true });
      });
      d.projected.forEach((p) => {
        if (!p.payDate) return;
        events.push({ date: new Date(p.payDate), symbol: h.symbol, name: h.name || h.symbol, amount: p.amountPerShare * h.shares, declared: false });
      });
    });
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [holdings, dividendData]);

  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; value: number; locked: boolean }[] = [];
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), value: 0, locked: i >= FREE_MONTHLY_PERIODS });
    }
    paymentEvents.forEach((e) => {
      const key = format(e.date, "yyyy-MM");
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.value += e.amount;
    });
    return buckets;
  }, [paymentEvents]);

  const annual = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; value: number; locked: boolean }[] = [];
    for (let i = 0; i < 3; i++) {
      const y = now.getFullYear() + i;
      buckets.push({ key: String(y), label: String(y), value: 0, locked: i >= FREE_ANNUAL_PERIODS });
    }
    paymentEvents.forEach((e) => {
      const key = String(e.date.getFullYear());
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.value += e.amount;
    });
    return buckets;
  }, [paymentEvents]);

  const data = view === "monthly" ? monthly : annual;
  const chartData = data.map((d) => ({ ...d, value: isPremium || !d.locked ? d.value : 0 }));
  const thisPeriod = data[0];
  const hasAnyData = paymentEvents.length > 0;

  const currentKey = view === "monthly" ? format(new Date(), "yyyy-MM") : String(new Date().getFullYear());
  const thisPeriodEvents = paymentEvents.filter((e) => (view === "monthly" ? format(e.date, "yyyy-MM") : String(e.date.getFullYear())) === currentKey);
  const declaredEvents = thisPeriodEvents.filter((e) => e.declared);
  const estimatedEvents = thisPeriodEvents.filter((e) => !e.declared);
  const declaredTotal = declaredEvents.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-serif text-lg flex items-center gap-1.5">
          Estimated Future Payments
          <InfoTip>Confirmed upcoming payments plus a cadence-based projection from each holding's own payout history — no growth assumed.</InfoTip>
        </h3>
        <button
          data-small-target
          onClick={() => setView((v) => (v === "monthly" ? "annual" : "monthly"))}
          className="flex items-center gap-1.5 h-7 px-1 rounded-full bg-muted/60 text-[0.625rem] font-semibold"
        >
          <span className={`px-2 py-0.5 rounded-full transition-colors ${view === "monthly" ? "bg-background" : ""}`}>Monthly</span>
          <span className={`px-2 py-0.5 rounded-full transition-colors ${view === "annual" ? "bg-background" : ""}`}>Annual</span>
        </button>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground mb-3">
        Plan your cash flow month-by-month, or switch to Annual for the 3-year forecast.
      </p>

      {/* Chart and breakdown always render — the monthly/annual buckets are
          already zero-filled placeholders regardless of data, so a portfolio
          with no confirmed or projected payments yet still shows the tool
          (an empty timeline), not a text box in its place. */}
      <div className="flat-section rounded-xl bg-muted/40 p-3 mb-3">
        <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {thisPeriod.label}{view === "monthly" ? ` ${new Date().getFullYear()}` : ""} (Unrealised)
        </p>
        <p className="text-lg font-bold tabular mt-0.5">
          {showValues ? `${currencyLabel}${(thisPeriod?.value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "••••"}
        </p>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={view === "monthly" ? 1 : 0} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={view === "monthly" ? 14 : 40}>
              {chartData.map((d) => (
                <Cell key={d.key} fill={isPremium || !d.locked ? "hsl(270 91% 65%)" : "hsl(var(--muted-foreground) / 0.15)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!hasAnyData && (
        <p className="text-[0.625rem] text-muted-foreground text-center -mt-1 mb-2">
          Not enough dividend history yet to project future payments for this portfolio.
        </p>
      )}
      {hasAnyData && !isPremium && (
        <p className="text-[0.625rem] text-muted-foreground text-center -mt-1 mb-2">
          Showing the next {view === "monthly" ? "period" : "year"} only · the full forecast is a premium feature
        </p>
      )}

      <p className="section-eyebrow mt-2 mb-1">
        {thisPeriod.label}{view === "monthly" ? ` ${new Date().getFullYear()}` : ""}
        <span className="text-muted-foreground font-normal"> · {declaredEvents.length} declared · {estimatedEvents.length} estimated</span>
      </p>
      <div className="grid grid-cols-2 text-[0.625rem] text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
        <span>Symbol</span><span className="text-right">Amount</span>
      </div>
      <div className="flex items-center justify-between py-2 rounded-lg bg-primary/10 px-2 -mx-2 mt-1">
        <span className="text-[0.75rem] font-bold">Declared payments</span>
        <span className="text-[0.75rem] font-bold tabular">{showValues ? `${currencyLabel}${declaredTotal.toFixed(2)}` : "••••"}</span>
      </div>
      <div className="divide-y divide-border/40">
        {declaredEvents.map((e, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div>
              <span className="text-[0.75rem] font-bold text-primary">{e.symbol}</span>
              <span className="text-[0.6875rem] text-muted-foreground ml-1.5 truncate">{e.name}</span>
            </div>
            <span className="text-[0.75rem] font-semibold tabular">{showValues ? `${currencyLabel}${e.amount.toFixed(2)}` : "••••"}</span>
          </div>
        ))}
        {declaredEvents.length === 0 && (
          <p className="text-[0.6875rem] text-muted-foreground py-2">No confirmed payments announced for this period yet.</p>
        )}
      </div>
    </div>
  );
}
