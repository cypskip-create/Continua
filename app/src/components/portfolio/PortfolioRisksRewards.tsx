import { useState } from "react";
import { Star, ShieldAlert, ChevronDown } from "lucide-react";
import { InfoTip } from "./InfoTip";
import type { ResearchBundle } from "@/api/types";
import type { ValuationResult } from "@/api/valuationApi";
import type { BenchmarkAverages } from "@/hooks/useMarketBenchmark";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";
import { dividendQualityScore } from "./DividendQuality";

interface HoldingLike { symbol: string; name?: string }

interface Flag { symbol: string; label: string; kind: "reward" | "risk" }

interface PortfolioRisksRewardsProps {
  holdings: HoldingLike[];
  research: Record<string, ResearchBundle | undefined>;
  valuations: Record<string, ValuationResult | undefined>;
  benchmark: BenchmarkAverages;
  dividendData: Record<string, HoldingDividendData>;
}

/** Aggregates real per-holding risk/reward checks into a portfolio-level
 *  count — same idea as Simply Wall St's Risk (!) & Rewards (★) section
 *  under the portfolio Snowflake, but every check here traces back to a
 *  real number Continua already computes elsewhere (valuation models,
 *  research ratios, dividend history) rather than a black-box score. */
function evaluateHolding(symbol: string, name: string, research: ResearchBundle | undefined, valuation: ValuationResult | undefined, benchmark: BenchmarkAverages, dividend: HoldingDividendData | undefined): Flag[] {
  const flags: Flag[] = [];
  const ratios = research?.ratios;

  const bestModel = valuation?.models.find((m) => m.fairValue != null && m.upsidePercent != null);
  if (bestModel?.upsidePercent != null) {
    if (bestModel.upsidePercent >= 20) flags.push({ symbol, label: `${name} is trading well below its estimated fair value`, kind: "reward" });
    if (bestModel.upsidePercent <= -20) flags.push({ symbol, label: `${name} is trading well above its estimated fair value`, kind: "risk" });
  }

  if (ratios?.priceMomentum3m != null && benchmark.priceMomentum3m != null) {
    if (ratios.priceMomentum3m > benchmark.priceMomentum3m + 5) flags.push({ symbol, label: `${name} has outpaced the market sample over 3 months`, kind: "reward" });
    if (ratios.priceMomentum3m < 0 && ratios.priceMomentum3m < benchmark.priceMomentum3m) flags.push({ symbol, label: `${name} has lagged the market sample and is down over 3 months`, kind: "risk" });
  }

  if (ratios?.roe != null && benchmark.roe != null && ratios.roe > benchmark.roe) {
    flags.push({ symbol, label: `${name} generates a higher return on equity than the market sample`, kind: "reward" });
  }

  if (ratios?.debtToEquity != null && benchmark.debtToEquity != null && ratios.debtToEquity > benchmark.debtToEquity * 1.5) {
    flags.push({ symbol, label: `${name} carries meaningfully more debt relative to equity than the market sample`, kind: "risk" });
  }

  if (dividend && dividend.payouts.length > 0) {
    const score = dividendQualityScore(dividend);
    if (score >= 5) flags.push({ symbol, label: `${name} has a high-quality, reliable dividend track record`, kind: "reward" });
    if (score <= 2) flags.push({ symbol, label: `${name}'s dividend track record is inconsistent or overdue`, kind: "risk" });
    if (dividend.growthPct != null && dividend.growthPct < 0) flags.push({ symbol, label: `${name}'s trailing dividend has shrunk versus the year before`, kind: "risk" });
  }

  return flags;
}

export function PortfolioRisksRewards({ holdings, research, valuations, benchmark, dividendData }: PortfolioRisksRewardsProps) {
  const [expanded, setExpanded] = useState<"rewards" | "risks" | null>(null);

  const allFlags = holdings.flatMap((h) =>
    evaluateHolding(h.symbol, h.name || h.symbol, research[h.symbol.toUpperCase()], valuations[h.symbol.toUpperCase()], benchmark, dividendData[h.symbol.toUpperCase()])
  );
  const rewards = allFlags.filter((f) => f.kind === "reward");
  const risks = allFlags.filter((f) => f.kind === "risk");

  if (holdings.length === 0) return null;

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-sm font-bold">Risks &amp; Rewards</h3>
        <InfoTip>
          Real checks run against every holding — valuation vs. fair value, momentum vs. the
          market sample, leverage, profitability, and dividend reliability — then rolled up
          into a portfolio-wide count.
        </InfoTip>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          data-small-target
          onClick={() => setExpanded((e) => (e === "rewards" ? null : "rewards"))}
          className="flat-section flex items-center justify-between rounded-xl bg-bull/10 px-3 py-2.5"
        >
          <span className="flex items-center gap-1.5 text-bull">
            <Star className="h-3.5 w-3.5 fill-bull" />
            <span className="text-[0.75rem] font-bold">{rewards.length} Reward{rewards.length === 1 ? "" : "s"}</span>
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-bull transition-transform ${expanded === "rewards" ? "rotate-180" : ""}`} />
        </button>
        <button
          data-small-target
          onClick={() => setExpanded((e) => (e === "risks" ? null : "risks"))}
          className="flat-section flex items-center justify-between rounded-xl bg-bear/10 px-3 py-2.5"
        >
          <span className="flex items-center gap-1.5 text-bear">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="text-[0.75rem] font-bold">{risks.length} Risk{risks.length === 1 ? "" : "s"}</span>
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-bear transition-transform ${expanded === "risks" ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {(expanded === "rewards" ? rewards : risks).length === 0 ? (
            <p className="text-[0.6875rem] text-muted-foreground py-2">No {expanded} identified from data on file.</p>
          ) : (
            (expanded === "rewards" ? rewards : risks).map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-[0.75rem]">
                <span className={`font-bold shrink-0 w-12 ${expanded === "rewards" ? "text-bull" : "text-bear"}`}>{f.symbol}</span>
                <span className="text-muted-foreground">{f.label}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
