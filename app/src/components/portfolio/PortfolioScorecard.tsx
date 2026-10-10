import { useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { InfoTip } from "./InfoTip";
import { dividendQualityScore } from "./DividendQuality";
import type { ResearchBundle } from "@/api/types";
import type { ValuationResult } from "@/api/valuationApi";
import type { BenchmarkAverages } from "@/hooks/useMarketBenchmark";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike { symbol: string; name?: string; weight: number }

interface PortfolioScorecardProps {
  holdings: HoldingLike[];
  research: Record<string, ResearchBundle | undefined>;
  valuations: Record<string, ValuationResult | undefined>;
  benchmark: BenchmarkAverages;
  dividendData: Record<string, HoldingDividendData>;
}

type Axis = "Value" | "Future" | "Past" | "Health" | "Dividend";
const AXES: Axis[] = ["Value", "Future", "Past", "Health", "Dividend"];

const clamp06 = (n: number) => Math.max(0, Math.min(6, n));

function scoreHolding(symbol: string, research: ResearchBundle | undefined, valuation: ValuationResult | undefined, benchmark: BenchmarkAverages, dividend: HoldingDividendData | undefined): Record<Axis, number | null> {
  const ratios = research?.ratios;
  const bestModel = valuation?.models.find((m) => m.upsidePercent != null);

  const value = bestModel?.upsidePercent != null ? clamp06(3 + bestModel.upsidePercent / 20) : null;
  const future = ratios?.priceMomentum3m != null ? clamp06(3 + ratios.priceMomentum3m / 10) : null;
  const past = ratios?.roe != null && benchmark.roe != null ? clamp06(3 + (ratios.roe - benchmark.roe) / 5) : null;
  const health = ratios?.debtToEquity != null && benchmark.debtToEquity != null ? clamp06(3 - (ratios.debtToEquity - benchmark.debtToEquity) / 20) : null;
  const dividendScore = dividend && dividend.payouts.length > 0 ? dividendQualityScore(dividend) : null;

  return { Value: value, Future: future, Past: past, Health: health, Dividend: dividendScore };
}

export function PortfolioScorecard({ holdings, research, valuations, benchmark, dividendData }: PortfolioScorecardProps) {
  const [selected, setSelected] = useState<Axis>("Value");

  const perHolding = holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name || h.symbol,
    weight: h.weight,
    scores: scoreHolding(h.symbol, research[h.symbol.toUpperCase()], valuations[h.symbol.toUpperCase()], benchmark, dividendData[h.symbol.toUpperCase()]),
  }));

  // Returns null (not 0) when no holding has real data for this axis — a
  // portfolio-wide "no data" case is never shown as a real score of zero.
  const axisAverage = (axis: Axis): number | null => {
    const vals = perHolding.map((h) => h.scores[axis]).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  // The radar still needs a numeric point per axis to keep the five-point
  // snowflake shape recognizable, so a missing axis plots at the chart's
  // origin (0) — but the headline readout below never states that as a
  // real "0.00 / 6" score; see the ?? null check there.
  const radarData = AXES.map((axis) => ({ metric: axis.toUpperCase(), v: axisAverage(axis) ?? 0 }));

  const ranked = [...perHolding]
    .filter((h) => h.scores[selected] != null)
    .sort((a, b) => (b.scores[selected] as number) - (a.scores[selected] as number));
  const lifting = ranked.slice(0, 3);
  const holdingBack = ranked.slice(3).reverse();

  const AXIS_DESCRIPTIONS: Record<Axis, string> = {
    Value: "How far each holding trades from its narrative fair value.",
    Future: "Recent price momentum, used as a forward-looking proxy — Continua doesn't have analyst growth forecasts yet.",
    Past: "Return on equity relative to the market sample.",
    Health: "Debt to equity relative to the market sample — lower is stronger.",
    Dividend: "Dividend Quality score from real, confirmed payout history.",
  };

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <h3 className="font-serif text-lg">Portfolio Scorecard</h3>
        <InfoTip>
          This chart brings five screening measures together. Select a measure to see the
          holdings behind it. A larger shape means more checks passed, not a guarantee of
          better returns. Missing information can limit the score.
        </InfoTip>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground mb-4">
        Your portfolio scored out of 6 on five measures at once. Select a measure below to see the detail.
      </p>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: "0.625rem", fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: string) => v}
            />
            <Radar dataKey="v" stroke="hsl(24 95% 53%)" fill="hsl(24 95% 53%)" fillOpacity={0.5} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-3">
        {AXES.map((axis) => (
          <button
            key={axis}
            data-small-target
            onClick={() => setSelected(axis)}
            className={`shrink-0 h-8 px-3 rounded-full text-[0.6875rem] font-semibold ${selected === axis ? "contrast-active" : "bg-muted/60"}`}
          >
            {axis}
          </button>
        ))}
      </div>

      <p className="text-[0.9375rem] font-bold font-serif">{selected} <span className="text-muted-foreground font-sans text-[0.8125rem] font-normal">{axisAverage(selected) != null ? `${axisAverage(selected)!.toFixed(2)} / 6` : "No data"}</span></p>
      <p className="text-[0.6875rem] text-muted-foreground mb-3">{AXIS_DESCRIPTIONS[selected]}</p>

      {ranked.length === 0 ? (
        <p className="text-[0.6875rem] text-muted-foreground py-4 text-center">Not enough data on file yet for this measure.</p>
      ) : (
        <>
          {lifting.length > 0 && (
            <div className="mb-3">
              <p className="section-eyebrow mb-1">Lifting the score</p>
              {lifting.map((h) => <ScoreRow key={h.symbol} h={h} axis={selected} />)}
            </div>
          )}
          {holdingBack.length > 0 && (
            <div>
              <p className="section-eyebrow mb-1">Holding it back</p>
              {holdingBack.map((h) => <ScoreRow key={h.symbol} h={h} axis={selected} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoreRow({ h, axis }: { h: { symbol: string; name: string; weight: number; scores: Record<Axis, number | null> }; axis: Axis }) {
  const score = h.scores[axis] ?? 0;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.78125rem] font-bold underline decoration-dotted underline-offset-2">{h.name}</span>
        <span className="text-[0.75rem] font-bold tabular">{score.toFixed(0)}/6</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-bull" style={{ width: `${(score / 6) * 100}%` }} />
        </div>
        <span className="text-[0.65625rem] text-muted-foreground w-10 text-right">{h.weight.toFixed(1)}%</span>
      </div>
    </div>
  );
}
