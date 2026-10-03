import { useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { InfoTip } from "@/components/portfolio/InfoTip";
import { useValuation } from "@/hooks/useValuation";
import { useResearch } from "@/hooks/useResearch";
import { useDividendHistory } from "@/hooks/useDividendHistory";
import { useMarketBenchmark } from "@/hooks/useMarketBenchmark";

interface StockSnowflakeProps { symbol: string }

type Axis = "Value" | "Future" | "Past" | "Health" | "Dividend";
const AXES: Axis[] = ["Value", "Future", "Past", "Health", "Dividend"];
const clamp06 = (n: number) => Math.max(0, Math.min(6, n));

interface AxisCheck { label: string; status: "pass" | "fail" | "unknown" }

/** The same five-pillar model Simply Wall St's Snowflake uses (Value /
 *  Future / Past / Health / Dividend, each out of 6) built from real
 *  Continua data — the same valuation models, research ratios, and
 *  dividend history already powering the portfolio-level Scorecard,
 *  just evaluated for one company instead of averaged across holdings.
 *  Where Continua has no data source yet (forward analyst growth
 *  estimates, multi-year ROE history), the check is marked "unknown"
 *  rather than guessed. */
export function StockSnowflake({ symbol }: StockSnowflakeProps) {
  const [selected, setSelected] = useState<Axis>("Value");
  const { valuation, isLoading: valLoading } = useValuation(symbol);
  const { research, isLoading: researchLoading } = useResearch(symbol);
  const { history: dividendHistory, isLoading: divLoading } = useDividendHistory(symbol);
  const { averages: benchmark, isLoading: benchLoading } = useMarketBenchmark();

  const isLoading = valLoading || researchLoading || divLoading || benchLoading;
  const ratios = research?.ratios;
  const bestModel = valuation?.models.find((m) => m.upsidePercent != null);

  const checksFor: Record<Axis, AxisCheck[]> = {
    Value: [
      { label: "Trading below Sector P/E fair value", status: bestModel?.upsidePercent == null ? "unknown" : bestModel.upsidePercent > 10 ? "pass" : "fail" },
      { label: "Trading below Graham Number", status: valuation?.models.find(m => m.model.includes("Graham"))?.upsidePercent == null ? "unknown" : (valuation!.models.find(m => m.model.includes("Graham"))!.upsidePercent! > 0 ? "pass" : "fail") },
      { label: "P/E below market sample", status: ratios?.pe == null || benchmark.pe == null ? "unknown" : ratios.pe < benchmark.pe ? "pass" : "fail" },
    ],
    Future: [
      { label: "Forward analyst growth estimate on file", status: "unknown" },
      { label: "Positive 3-month price momentum", status: ratios?.priceMomentum3m == null ? "unknown" : ratios.priceMomentum3m > 0 ? "pass" : "fail" },
    ],
    Past: [
      { label: "ROE above market sample", status: ratios?.roe == null || benchmark.roe == null ? "unknown" : ratios.roe > benchmark.roe ? "pass" : "fail" },
      { label: "Positive net margin", status: ratios?.netMargin == null ? "unknown" : ratios.netMargin > 0 ? "pass" : "fail" },
    ],
    Health: [
      { label: "Debt to equity below market sample", status: ratios?.debtToEquity == null || benchmark.debtToEquity == null ? "unknown" : ratios.debtToEquity < benchmark.debtToEquity ? "pass" : "fail" },
      { label: "Current ratio above 1.0x", status: ratios?.currentRatio == null ? "unknown" : ratios.currentRatio > 1 ? "pass" : "fail" },
      { label: "Interest well covered by earnings", status: ratios?.interestCoverage == null ? "unknown" : ratios.interestCoverage > 3 ? "pass" : "fail" },
    ],
    Dividend: [
      { label: "Pays a dividend", status: dividendHistory.length > 0 ? "pass" : "fail" },
      { label: "Yield above market sample", status: ratios?.dividendYield == null || benchmark.dividendYield == null ? "unknown" : ratios.dividendYield > benchmark.dividendYield ? "pass" : "fail" },
      { label: "Sustainable payout ratio (below 75%)", status: ratios?.payoutRatio == null ? "unknown" : ratios.payoutRatio < 0.75 ? "pass" : "fail" },
    ],
  };

  const scoreFor = (axis: Axis): number => {
    const checks = checksFor[axis].filter((c) => c.status !== "unknown");
    if (checks.length === 0) return 0;
    const passed = checks.filter((c) => c.status === "pass").length;
    return clamp06((passed / checks.length) * 6);
  };

  const radarData = AXES.map((axis) => ({ metric: axis.toUpperCase(), v: scoreFor(axis) }));
  const totalScore = AXES.reduce((s, a) => s + scoreFor(a), 0);

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <h3 className="font-serif text-lg">Snowflake Score</h3>
        <InfoTip>
          Five real checks per axis, scored out of 6 — Value (valuation models), Future (momentum
          — Continua has no analyst growth forecasts yet), Past (profitability), Health (balance
          sheet), Dividend (yield, payout, reliability). A bigger, more even shape means a
          stronger, more balanced company.
        </InfoTip>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        {symbol} scored out of 6 on five measures at once — {totalScore.toFixed(0)}/30 total.
      </p>

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground py-10 text-center">Computing scores…</p>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
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
                className={`shrink-0 h-8 px-3 rounded-full text-[11px] font-semibold ${selected === axis ? "contrast-active" : "bg-muted/60"}`}
              >
                {axis} {scoreFor(axis).toFixed(0)}/6
              </button>
            ))}
          </div>

          <div className="divide-y divide-border/40">
            {checksFor[selected].map((c) => (
              <div key={c.label} className="flex items-center gap-2 py-2.5">
                {c.status === "pass" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-bull" />
                ) : c.status === "fail" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-bear" />
                ) : (
                  <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-[12.5px]">{c.label}</span>
                {c.status === "unknown" && <span className="text-[10px] text-muted-foreground ml-auto">No data</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
