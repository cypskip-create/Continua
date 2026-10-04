import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, Cell } from "recharts";
import { InfoTip } from "./InfoTip";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike { symbol: string; name?: string; shares: number }

interface DividendHistoryProps {
  holdings: HoldingLike[];
  dividendData: Record<string, HoldingDividendData>;
  isPremium?: boolean;
  showValues?: boolean;
  currencyLabel?: string;
}

const FREE_MONTHS = 2;

export function DividendHistory({ holdings, dividendData, isPremium = false, showValues = true, currencyLabel = "KSh" }: DividendHistoryProps) {
  const [view, setView] = useState<"monthly" | "annual">("monthly");

  const paidEvents = useMemo(() => {
    const events: { date: Date; symbol: string; name: string; amount: number }[] = [];
    holdings.forEach((h) => {
      const d = dividendData[h.symbol.toUpperCase()];
      if (!d) return;
      d.payouts.forEach((p) => {
        if (!p.payDate || new Date(p.payDate) > new Date()) return; // only what's actually been paid
        events.push({ date: new Date(p.payDate), symbol: h.symbol, name: h.name || h.symbol, amount: p.amountPerShare * h.shares });
      });
    });
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [holdings, dividendData]);

  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; value: number; locked: boolean }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), value: 0, locked: i >= FREE_MONTHS });
    }
    paidEvents.forEach((e) => {
      const key = format(e.date, "yyyy-MM");
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.value += e.amount;
    });
    return buckets;
  }, [paidEvents]);

  const annual = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; value: number; locked: boolean }[] = [];
    for (let i = 2; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({ key: String(y), label: String(y), value: 0, locked: i >= 1 });
    }
    paidEvents.forEach((e) => {
      const key = String(e.date.getFullYear());
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.value += e.amount;
    });
    return buckets;
  }, [paidEvents]);

  const data = view === "monthly" ? monthly : annual;
  const latestPaid = data[data.length - 1];
  const freeData = data.map((d) => ({ ...d, value: isPremium || !d.locked ? d.value : 0 }));

  const thisMonthEvents = paidEvents.filter((e) => format(e.date, "yyyy-MM") === format(new Date(), "yyyy-MM"));
  const totalThisMonth = thisMonthEvents.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-serif text-lg flex items-center gap-1.5">
          Dividend History
          <InfoTip>Every payment your portfolio has actually received, based on confirmed payment dates on file.</InfoTip>
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
        Track how much income your portfolio has paid out, month by month.
      </p>

      {/* Chart and breakdown always render — the monthly/annual buckets are
          already zero-filled placeholders regardless of data, so a portfolio
          with nothing paid yet still shows the tool (an empty timeline),
          not a text box in its place. */}
      <div className="flat-section rounded-xl bg-muted/40 p-3 mb-3">
        <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {latestPaid.label}{view === "monthly" ? ` ${new Date().getFullYear()}` : ""} (Realised)
        </p>
        <p className="text-lg font-bold tabular mt-0.5">
          {showValues ? `${currencyLabel}${latestPaid.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "••••"}
        </p>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={freeData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={view === "monthly" ? 1 : 0} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={view === "monthly" ? 14 : 40}>
              {freeData.map((d) => (
                <Cell key={d.key} fill={isPremium || !d.locked ? "hsl(var(--bull))" : "hsl(var(--muted-foreground) / 0.15)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {paidEvents.length === 0 && (
        <p className="text-[0.625rem] text-muted-foreground text-center -mt-1 mb-2">No dividends paid to this portfolio yet.</p>
      )}
      {paidEvents.length > 0 && !isPremium && (
        <p className="text-[0.625rem] text-muted-foreground text-center -mt-1 mb-2">
          Showing the last {FREE_MONTHS === 2 ? "two" : FREE_MONTHS} months · full history is a premium feature
        </p>
      )}

      <p className="section-eyebrow mt-2 mb-1">
        {format(new Date(), "MMM yyyy")} <span className="text-muted-foreground font-normal">· {thisMonthEvents.length} paid</span>
      </p>
      <div className="grid grid-cols-2 text-[0.625rem] text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
        <span>Symbol</span><span className="text-right">Amount</span>
      </div>
      <div className="flex items-center justify-between py-2 rounded-lg bg-bull/10 px-2 -mx-2 mt-1">
        <span className="text-[0.75rem] font-bold">Paid payments</span>
        <span className="text-[0.75rem] font-bold tabular">{showValues ? `${currencyLabel}${totalThisMonth.toFixed(2)}` : "••••"}</span>
      </div>
      <div className="divide-y divide-border/40">
        {thisMonthEvents.map((e, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div>
              <span className="text-[0.75rem] font-bold text-primary">{e.symbol}</span>
              <span className="text-[0.6875rem] text-muted-foreground ml-1.5 truncate">{e.name}</span>
            </div>
            <span className="text-[0.75rem] font-semibold tabular">{showValues ? `${currencyLabel}${e.amount.toFixed(2)}` : "••••"}</span>
          </div>
        ))}
        {thisMonthEvents.length === 0 && (
          <p className="text-[0.6875rem] text-muted-foreground py-2">No dividends paid this month.</p>
        )}
      </div>
    </div>
  );
}
