import { useState } from "react";
import { InfoTip } from "./InfoTip";
import { MetricDotPlot } from "./MetricDotPlot";
import type { ResearchBundle } from "@/api/types";
import type { ValuationResult } from "@/api/valuationApi";
import type { BenchmarkAverages } from "@/hooks/useMarketBenchmark";
import type { GrowthFigures } from "@/hooks/usePortfolioGrowth";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike { symbol: string; name?: string; value: number; weight: number; price: number; avgCost: number; shares: number }

interface KeyMetricsBenchmarksProps {
  holdings: HoldingLike[];
  research: Record<string, ResearchBundle | undefined>;
  valuations: Record<string, ValuationResult | undefined>;
  growth: Record<string, GrowthFigures>;
  dividendData: Record<string, HoldingDividendData>;
  benchmark: BenchmarkAverages;
  isLoading: boolean;
}

type Group = "Valuation" | "Future Growth" | "Past Performance" | "Financial Health" | "Dividends";
const GROUPS: Group[] = ["Valuation", "Future Growth", "Past Performance", "Financial Health", "Dividends"];

const SUBMETRICS: Record<Group, string[]> = {
  Valuation: ["Fair Value", "PE", "PS", "PEG", "PB"],
  "Future Growth": ["Earnings", "Revenue", "EPS"],
  "Past Performance": ["ROE", "ROCE", "ROA"],
  "Financial Health": ["Net Debt to Equity"],
  Dividends: ["Yield", "Growth", "Payout"],
};

const pctFmt = (v: number) => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}%`;
const xFmt = (v: number) => `${v.toFixed(1)}x`;

export function KeyMetricsBenchmarks({ holdings, research, valuations, growth, dividendData, benchmark, isLoading }: KeyMetricsBenchmarksProps) {
  const [group, setGroup] = useState<Group>("Valuation");
  const [metric, setMetric] = useState<string>("Fair Value");

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);

  const selectGroup = (g: Group) => { setGroup(g); setMetric(SUBMETRICS[g][0]); };

  const sum = (fn: (h: HoldingLike) => number | null) => holdings.reduce((total, holding) => {
    const value = fn(holding);
    return total + (value != null && Number.isFinite(value) ? value : 0);
  }, 0);

  // Builds dot-plot input for a per-holding numeric field with an optional
  // "higher is better" flag used purely for red/green coloring.
  function buildPoints(
    getValue: (symbol: string) => number | null | undefined,
    higherIsBetter: boolean,
    thresholdIsPortfolio = true,
  ) {
    const rows = holdings.map((h) => ({ symbol: h.symbol, weight: h.weight, value: getValue(h.symbol.toUpperCase()) }));
    const withValue = rows.filter((r): r is { symbol: string; weight: number; value: number } => r.value != null);
    const unavailableCount = rows.length - withValue.length;
    const coveredWeight = withValue.reduce((s, r) => s + r.weight, 0);
    const portfolioValue = coveredWeight > 0 ? withValue.reduce((s, r) => s + r.value * r.weight, 0) / coveredWeight : null;
    const points = withValue.map((r) => ({
      symbol: r.symbol,
      value: r.value,
      weight: r.weight,
      good: thresholdIsPortfolio && portfolioValue != null
        ? (higherIsBetter ? r.value >= portfolioValue : r.value <= portfolioValue)
        : undefined,
    }));
    return { points, portfolioValue, unavailableCount };
  }

  function render() {
    if (group === "Valuation") {
      if (metric === "Fair Value") {
        const { points, portfolioValue, unavailableCount } = buildPoints(
          (s) => valuations[s]?.models.find((m) => m.upsidePercent != null)?.upsidePercent ?? null,
          true,
        );
        const fairValue = sum((h) => {
          const upside = valuations[h.symbol.toUpperCase()]?.models.find((m) => m.upsidePercent != null)?.upsidePercent;
          return upside == null ? null : h.value * (1 + upside / 100);
        });
        const exactUpside = totalValue > 0 && fairValue > 0 ? ((fairValue - totalValue) / totalValue) * 100 : portfolioValue;
        return { title: "Fair Value", desc: "The combined intrinsic value of covered holdings compared with their current portfolio price.", formula: "Σ(shares × fair value) ÷ Σ(shares × price) − 1", node: <MetricDotPlot points={points} portfolioValue={exactUpside} fmt={pctFmt} unavailableCount={unavailableCount} /> };
      }
      if (metric === "PE") {
        const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.pe ?? null, false);
        const earnings = sum((h) => { const pe = research[h.symbol.toUpperCase()]?.ratios.pe; return pe && pe > 0 ? h.value / pe : null; });
        const exactPe = earnings > 0 ? totalValue / earnings : portfolioValue;
        return { title: "Price / Earnings", desc: "How much the portfolio pays for each shilling of earnings.", formula: "Σ market value ÷ Σ earnings", node: <MetricDotPlot points={points} portfolioValue={exactPe} marketValue={benchmark.pe} marketLabel={benchmark.sampleLabel} fmt={xFmt} unavailableCount={unavailableCount} /> };
      }
      if (metric === "PB") {
        const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.pb ?? null, false);
        const bookValue = sum((h) => { const pb = research[h.symbol.toUpperCase()]?.ratios.pb; return pb && pb > 0 ? h.value / pb : null; });
        const exactPb = bookValue > 0 ? totalValue / bookValue : portfolioValue;
        return { title: "Price / Book", desc: "Portfolio market value compared with the combined book value of covered holdings.", formula: "Σ market value ÷ Σ book value", node: <MetricDotPlot points={points} portfolioValue={exactPb} fmt={xFmt} unavailableCount={unavailableCount} /> };
      }
      return { title: metric, desc: `${metric} requires per-share revenue or forward-growth data that the verified NSE dataset does not provide yet.`, formula: metric === "PS" ? "Σ market value ÷ Σ revenue" : "Weighted average of holding PEG ratios", node: <MetricDotPlot points={[]} fmt={xFmt} /> };
    }

    if (group === "Future Growth") {
      const field = metric === "Earnings" ? "earningsGrowthPct" : metric === "Revenue" ? "revenueGrowthPct" : "epsGrowthPct";
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => growth[s]?.[field] ?? null, true);
      return { title: `Annual ${metric} Growth vs Market`, desc: `Value-weighted trailing growth from reported results. Analyst forecasts are not labelled as available when Continua has none.`, formula: "Σ(holding weight × reported growth)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }

    if (group === "Past Performance") {
      if (metric === "ROCE") {
        return { title: "Return on Capital Employed (ROCE)", desc: "EBIT and capital-employed totals are not yet available consistently for NSE holdings.", formula: "Σ EBIT ÷ Σ capital employed", node: <MetricDotPlot points={[]} fmt={pctFmt} /> };
      }
      const field = metric === "ROE" ? "roe" : "roa";
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios[field] ?? null, true);
      const marketValue = metric === "ROE" ? benchmark.roe : null;
      let exactReturn = portfolioValue;
      if (metric === "ROE") {
        const earnings = sum((h) => { const pe = research[h.symbol.toUpperCase()]?.ratios.pe; return pe && pe > 0 ? h.value / pe : null; });
        const equity = sum((h) => { const pb = research[h.symbol.toUpperCase()]?.ratios.pb; return pb && pb > 0 ? h.value / pb : null; });
        if (equity > 0) exactReturn = (earnings / equity) * 100;
      }
      return { title: `Return on ${metric === "ROE" ? "Equity (ROE)" : "Assets (ROA)"}`, desc: `How efficiently covered holdings generate profit from ${metric === "ROE" ? "shareholders' equity" : "assets"}.`, formula: metric === "ROE" ? "Σ earnings ÷ Σ equity" : "Value-weighted ROA (asset totals unavailable)", node: <MetricDotPlot points={points} portfolioValue={exactReturn} marketValue={marketValue} marketLabel={benchmark.sampleLabel} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }

    if (group === "Financial Health") {
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.debtToEquity ?? null, false);
      return { title: "Net Debt to Equity vs Market", desc: "Leverage across holdings compared with the NSE benchmark sample; lower generally means more financial resilience.", formula: "Σ debt ÷ Σ equity (value-weighted proxy where statement totals are unavailable)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} marketValue={benchmark.debtToEquity} marketLabel={benchmark.sampleLabel} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }

    // Dividends
    if (metric === "Yield") {
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.dividendYield ?? null, true);
      const annualIncome = sum((h) => h.shares * (dividendData[h.symbol.toUpperCase()]?.ttmPerShare ?? 0));
      const exactYield = totalValue > 0 ? (annualIncome / totalValue) * 100 : portfolioValue;
      return { title: "Portfolio Dividend Yield", desc: "Trailing cash distributions relative to the portfolio's current value.", formula: "Σ(shares × dividend per share) ÷ Σ market value", node: <MetricDotPlot points={points} portfolioValue={exactYield} marketValue={benchmark.dividendYield} marketLabel={benchmark.sampleLabel} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }
    if (metric === "Payout") {
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.payoutRatio ?? null, false);
      const dividends = sum((h) => h.shares * (dividendData[h.symbol.toUpperCase()]?.ttmPerShare ?? 0));
      const earnings = sum((h) => { const pe = research[h.symbol.toUpperCase()]?.ratios.pe; return pe && pe > 0 ? h.value / pe : null; });
      const exactPayout = earnings > 0 ? (dividends / earnings) * 100 : portfolioValue;
      return { title: "Payout Ratio", desc: "The share of covered portfolio earnings distributed as dividends.", formula: "Σ dividends ÷ Σ earnings", node: <MetricDotPlot points={points} portfolioValue={exactPayout} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }
    const { points, portfolioValue, unavailableCount } = buildPoints((s) => dividendData[s]?.growthPct ?? null, true);
    return { title: "Dividend Growth Rate", desc: "Value-weighted growth in trailing payouts versus the preceding period.", formula: "Σ(holding weight × dividend growth)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} fmt={pctFmt} unavailableCount={unavailableCount} /> };
  }

  const { title, desc, formula, node } = render();

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="font-serif text-lg">Key Metrics &amp; Benchmarks</h3>
        <InfoTip>
          Your value-weighted portfolio average compared against the {benchmark.sampleLabel} — a
          market-cap sample, not the full exchange, so we're not calling 60+ endpoints on every
          page load.
        </InfoTip>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            data-small-target
            onClick={() => selectGroup(g)}
            className={`shrink-0 h-8 px-3 rounded-full text-[11px] font-semibold ${group === g ? "contrast-active" : "bg-muted/60"}`}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
        {SUBMETRICS[group].map((m) => (
          <button
            key={m}
            data-small-target
            onClick={() => setMetric(m)}
            className={`shrink-0 h-7 px-3 rounded-full text-[10.5px] font-semibold border ${metric === m ? "border-foreground text-foreground" : "border-transparent text-muted-foreground bg-muted/40"}`}
          >
            {m}
          </button>
        ))}
      </div>

      <p className="text-[13px] font-bold mb-0.5">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-3">{desc}</p>
      {formula && <p className="mb-3 rounded-lg bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">Portfolio calculation:</span> {formula}</p>}

      {isLoading ? <p className="text-[11px] text-muted-foreground py-8 text-center">Loading benchmark data…</p> : node}
    </div>
  );
}
