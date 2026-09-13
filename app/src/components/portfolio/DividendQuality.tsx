import { CheckCircle2, AlertCircle } from "lucide-react";
import { InfoTip } from "./InfoTip";
import { LockedPreview } from "./LockedPreview";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike {
  id: string;
  symbol: string;
  name?: string;
  shares: number;
  price: number;
  avgCost: number;
}

interface DividendQualityProps {
  holdings: HoldingLike[];
  dividendData: Record<string, HoldingDividendData>;
  isPremium?: boolean;
  showValues?: boolean;
  currencyLabel?: string;
}

/** 0–6 dividend quality score built entirely from real payout history —
 *  no analyst opinion involved. Three sub-scores, each worth up to 2 points:
 *   · Longevity   — how many real payouts are on record (a longer track
 *                    record is harder to fake than one good year)
 *   · Growth      — trailing-12m payout vs the 12m before that
 *   · Recency     — months since the last confirmed ex-date (skipped or
 *                    very overdue payers score lower)
 *  A holding with zero payouts on record scores 0 and sits in the Low tier
 *  rather than being excluded, same as it would show 0% yield elsewhere. */
export function dividendQualityScore(d: HoldingDividendData): number {
  let score = 0;
  if (d.payouts.length >= 8) score += 2;
  else if (d.payouts.length >= 4) score += 1;

  if (d.growthPct != null) {
    if (d.growthPct > 0) score += 2;
    else if (d.growthPct === 0) score += 1;
  } else if (d.payouts.length > 0) {
    score += 1; // not enough history to judge growth, but it does pay
  }

  if (d.monthsSinceLastPay != null) {
    if (d.monthsSinceLastPay <= 12) score += 2;
    else if (d.monthsSinceLastPay <= 18) score += 1;
  }

  return score;
}

const TIERS = [
  { key: "low", label: "Low score 0-2", dot: "bg-bear", min: 0, max: 2 },
  { key: "medium", label: "Medium score 3-4", dot: "bg-amber-500", min: 3, max: 4 },
  { key: "high", label: "High score 5-6", dot: "bg-bull", min: 5, max: 6 },
] as const;

const fmtMoney = (v: number, currencyLabel: string, showValues: boolean) =>
  showValues ? `${currencyLabel}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "••••";

export function DividendQuality({ holdings, dividendData, isPremium = false, showValues = true, currencyLabel = "KSh" }: DividendQualityProps) {
  const rows = holdings.map((h) => {
    const d = dividendData[h.symbol.toUpperCase()];
    const score = d ? dividendQualityScore(d) : 0;
    const annualIncome = (d?.ttmPerShare ?? 0) * h.shares;
    const yieldOnPrice = h.price > 0 ? ((d?.ttmPerShare ?? 0) / h.price) * 100 : 0;
    const yieldOnCost = h.avgCost > 0 ? ((d?.ttmPerShare ?? 0) / h.avgCost) * 100 : 0;
    return { holding: h, d, score, annualIncome, yieldOnPrice, yieldOnCost };
  }).filter((r) => r.annualIncome > 0);

  const totalIncome = rows.reduce((s, r) => s + r.annualIncome, 0);

  if (rows.length === 0) {
    return (
      <div className="card-gradient rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold">No confirmed dividend history yet</p>
        <p className="text-xs text-muted-foreground mt-1">Holdings with a recorded payout on file will show up here.</p>
      </div>
    );
  }

  const tierBreakdown = TIERS.map((t) => {
    const tierRows = rows.filter((r) => r.score >= t.min && r.score <= t.max);
    const income = tierRows.reduce((s, r) => s + r.annualIncome, 0);
    return { ...t, count: tierRows.length, income, pct: totalIncome > 0 ? (income / totalIncome) * 100 : 0 };
  });

  return (
    <div className="space-y-4">
      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
          Dividend Quality
          <InfoTip>
            A 0–6 score built from real, confirmed payouts on file: longevity of payments,
            trailing-12m growth vs the prior 12m, and how recently a payment was made.
            No forecast or analyst opinion is involved.
          </InfoTip>
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Built from real, confirmed payouts on file — reliability and growth, not a forecast.
        </p>

        <div className="rounded-xl bg-muted/40 p-3 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Trailing 12m Income</p>
          <p className="text-xl font-bold tabular mt-0.5">{fmtMoney(totalIncome, currencyLabel, showValues)}</p>
        </div>

        <LockedPreview
          unlocked={isPremium}
          label="Unlock quality breakdown"
          locked={
            <div>
              <div className="space-y-3">
                {tierBreakdown.filter((t) => t.count > 0).map((t) => (
                  <div key={t.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold">{t.label}</p>
                        <p className="text-[10.5px] text-muted-foreground">{t.count} holding{t.count === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-bold tabular">{fmtMoney(t.income, currencyLabel, showValues)}</p>
                      <p className="text-[10.5px] text-muted-foreground">{t.pct.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="section-eyebrow mt-4 mb-2">Income share by quality tier</p>
              <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
                {tierBreakdown.map((t) => (
                  t.pct > 0 && <div key={t.key} className={t.dot} style={{ width: `${t.pct}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          }
        >
          <></>
        </LockedPreview>
      </div>

      <LockedPreview
        unlocked={isPremium}
        label="Unlock per-holding scores"
        locked={
          <div className="card-gradient rounded-2xl p-4 overflow-x-auto">
            <p className="section-eyebrow mb-3">Yield &amp; growth by holding</p>
            <div className="min-w-[420px]">
              <div className="grid grid-cols-[1fr_1fr_0.8fr_0.9fr] gap-2 text-[10px] text-muted-foreground uppercase tracking-wide pb-2 border-b border-border/50">
                <span>Symbol</span>
                <span className="text-right">12m Payment</span>
                <span className="text-right">Yield / Cost</span>
                <span className="text-right">Score</span>
              </div>
              <div className="divide-y divide-border/40">
                {rows.sort((a, b) => b.annualIncome - a.annualIncome).map((r) => (
                  <div key={r.holding.id} className="grid grid-cols-[1fr_1fr_0.8fr_0.9fr] gap-2 py-2.5 items-center">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold">{r.holding.symbol}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.holding.name || r.holding.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold tabular">{fmtMoney(r.annualIncome, currencyLabel, showValues)}<span className="text-[10px] text-muted-foreground">/yr</span></p>
                      <p className="text-[10px] text-muted-foreground">{totalIncome > 0 ? ((r.annualIncome / totalIncome) * 100).toFixed(1) : "0.0"}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold tabular">{r.yieldOnPrice.toFixed(1)}%</p>
                      <p className="text-[10px] text-muted-foreground">{r.yieldOnCost.toFixed(1)}% on cost</p>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {r.score >= 5 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-bull" />
                      ) : r.score <= 2 ? (
                        <AlertCircle className="h-3.5 w-3.5 text-bear" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      <span className="text-[11px] font-semibold tabular">{r.score}/6</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <></>
      </LockedPreview>
    </div>
  );
}