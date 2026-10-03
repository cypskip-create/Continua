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
    const rows = holdings.map((h) => ({ symbol: h.symbol, name: h.name, weight: h.weight, value: getValue(h.symbol.toUpperCase()) }));
    const withValue = rows.filter((r): r is { symbol: string; name: string | undefined; weight: number; value: number } => r.value != null);
    const unavailableCount = rows.length - withValue.length;
    const coveredWeight = withValue.reduce((s, r) => s + r.weight, 0);
    const portfolioValue = coveredWeight > 0 ? withValue.reduce((s, r) => s + r.value * r.weight, 0) / coveredWeight : null;
    const points = withValue.map((r) => ({
      symbol: r.symbol,
      name: r.name,
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
      if (metric === "PS") {
        const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.ps ?? null, false);
        return { title: "Price / Sales", desc: "Market value paid for each shilling of reported revenue.", formula: "Σ market value ÷ Σ revenue", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} fmt={xFmt} unavailableCount={unavailableCount} /> };
      }
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => {
        const pe = research[s]?.ratios.pe;
        const epsGrowth = growth[s]?.epsGrowthPct;
        return pe != null && epsGrowth != null && epsGrowth > 0 ? pe / epsGrowth : null;
      }, false);
      return { title: "PEG Ratio", desc: "P/E adjusted for the latest verified annual EPS growth; lower can indicate better growth-adjusted value.", formula: "P/E ÷ annual EPS growth (%)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} fmt={xFmt} unavailableCount={unavailableCount} /> };
    }

    if (group === "Future Growth") {
      const field = metric === "Earnings" ? "earningsGrowthPct" : metric === "Revenue" ? "revenueGrowthPct" : "epsGrowthPct";
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => growth[s]?.[field] ?? null, true);
      return { title: `Annual ${metric} Growth vs Market`, desc: `Value-weighted trailing growth from reported results. Analyst forecasts are not labelled as available when Continua has none.`, formula: "Σ(holding weight × reported growth)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }

    if (group === "Past Performance") {
      if (metric === "ROCE") {
        const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.roic != null ? research[s]!.ratios.roic! * 100 : null, true);
        return { title: "Return on Invested Capital", desc: "Operating profit relative to verified equity and debt capital. Shown as ROIC because complete current-liability data is not available for a consistent ROCE calculation.", formula: "Operating income ÷ (equity + debt)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} fmt={pctFmt} unavailableCount={unavailableCount} /> };
      }
      const field = metric === "ROE" ? "roe" : "roa";
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios[field] != null ? research[s]!.ratios[field]! * 100 : null, true);
      const marketValue = metric === "ROE" && benchmark.roe != null ? benchmark.roe * 100 : null;
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
      return { title: "Debt to Equity vs Market", desc: "Leverage across holdings compared with the NSE benchmark sample; lower generally means more financial resilience.", formula: "Σ debt ÷ Σ equity (value-weighted proxy where statement totals are unavailable)", node: <MetricDotPlot points={points} portfolioValue={portfolioValue} marketValue={benchmark.debtToEquity} marketLabel={benchmark.sampleLabel} fmt={xFmt} unavailableCount={unavailableCount} /> };
    }

    // Dividends
    if (metric === "Yield") {
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.dividendYield != null ? research[s]!.ratios.dividendYield! * 100 : null, true);
      const annualIncome = sum((h) => h.shares * (dividendData[h.symbol.toUpperCase()]?.ttmPerShare ?? 0));
      const exactYield = totalValue > 0 ? (annualIncome / totalValue) * 100 : portfolioValue;
      return { title: "Portfolio Dividend Yield", desc: "Trailing cash distributions relative to the portfolio's current value.", formula: "Σ(shares × dividend per share) ÷ Σ market value", node: <MetricDotPlot points={points} portfolioValue={exactYield} marketValue={benchmark.dividendYield != null ? benchmark.dividendYield * 100 : null} marketLabel={benchmark.sampleLabel} fmt={pctFmt} unavailableCount={unavailableCount} /> };
    }
    if (metric === "Payout") {
      const { points, portfolioValue, unavailableCount } = buildPoints((s) => research[s]?.ratios.payoutRatio != null ? research[s]!.ratios.payoutRatio! * 100 : null, false);
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
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="font-serif text-lg">Key Metrics &amp; Benchmarks</h3>
        <InfoTip>
          Your value-weighted portfolio average compared against the {benchmark.sampleLabel} — a
          market-cap sample, not the full exchange, so we're not calling 60+ endpoints on every
          page load.
        </InfoTip>
        {isLoading && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary" aria-label="Updating benchmark data" />}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-5 scrollbar-hide">
        {GROUPS.map((g) => (
          <button
            key={g}
            data-small-target
            onClick={() => selectGroup(g)}
            className={`shrink-0 h-9 px-4 rounded-lg text-[11px] font-semibold ${group === g ? "contrast-active" : "bg-muted/40 text-muted-foreground"}`}
          >
            {g}
          </button>
        ))}
      </div>
      <h4 className="mb-3 font-serif text-2xl font-semibold">{group}</h4>
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 mb-5">
        {SUBMETRICS[group].map((m) => (
          <button
            key={m}
            data-small-target
            onClick={() => setMetric(m)}
            className={`shrink-0 h-9 px-4 rounded-md text-xs font-semibold ${metric === m ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-1.5">
        <p className="text-base font-bold">{title}</p>
        <InfoTip>{desc} Calculation: {formula}</InfoTip>
      </div>
      <p className="mb-5 text-sm leading-6 text-muted-foreground">{desc}</p>

      {node}
    </div>
  );
}
