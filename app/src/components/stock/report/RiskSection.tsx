import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { fx } from "@/lib/chartPalette";
import { historicalApi } from "@/api/historicalApi";
import { useResearch } from "@/hooks/useResearch";
import { useValuation } from "@/hooks/useValuation";
import { useMarketBenchmark } from "@/hooks/useMarketBenchmark";
import { InfoTip } from "@/components/portfolio/InfoTip";
import { dailyReturns, annualizedVolatility, maxDrawdown } from "@/lib/portfolioMetrics";
import { ReportSection, SubWidget } from "./ReportSection";

interface Props { symbol: string }

type RiskLevel = "Low" | "Medium" | "High" | "Unknown";
interface RiskFactor { label: string; note: string; level: RiskLevel }

// "Unknown" is a real, distinct state — a factor Continua can't evaluate
// yet is never scored as "Medium". Conflating "no data" with "medium risk"
// would misrepresent a missing input as a real neutral assessment.
const levelScore = (l: RiskLevel) => (l === "Low" ? 80 : l === "Medium" ? 50 : l === "High" ? 20 : 0);
const levelColor = (l: RiskLevel) => (l === "Low" ? fx.strong : l === "Medium" ? fx.ok : l === "High" ? fx.weak : "hsl(var(--muted-foreground))");

/** Real annualized volatility and max drawdown from daily candles (same
 *  math as the portfolio's Risk Analysis tool), plus a risk checklist
 *  built from real valuation, momentum, and leverage signals. Factors
 *  Continua can't evaluate render as "Unknown" — not a fabricated
 *  "Medium" — and are excluded from the radar rather than silently
 *  plotted as a real neutral score. */
export function RiskSection({ symbol }: Props) {
  const candlesQuery = useQuery({
    queryKey: ["continua", "candles", symbol, "risk-180"],
    queryFn: () => historicalApi.getCandles(symbol, { interval: "1d", from: new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10) }),
    staleTime: 15 * 60_000,
  });
  const { research } = useResearch(symbol);
  const { valuation } = useValuation(symbol);
  const { averages: benchmark } = useMarketBenchmark();

  const closes = (candlesQuery.data ?? []).map((c) => c.close);
  const returns = dailyReturns(closes);
  const volatility = returns.length >= 5 ? annualizedVolatility(returns) : null;
  const drawdown = closes.length >= 2 ? maxDrawdown(closes) : null;

  const ratios = research?.ratios;
  const bestModel = valuation?.models.find((m) => m.upsidePercent != null);

  const factors: RiskFactor[] = [
    {
      label: "Valuation risk",
      note: bestModel?.upsidePercent != null ? `${Math.abs(bestModel.upsidePercent).toFixed(0)}% ${bestModel.upsidePercent >= 0 ? "below" : "above"} the model's fair value` : "No valuation model available",
      level: bestModel?.upsidePercent == null ? "Unknown" : bestModel.upsidePercent < -20 ? "High" : bestModel.upsidePercent < 0 ? "Medium" : "Low",
    },
    {
      label: "Price volatility",
      note: volatility != null ? `${volatility.toFixed(1)}% annualized, last 180 days` : "Not enough price history on file",
      level: volatility == null ? "Unknown" : volatility > 35 ? "High" : volatility > 20 ? "Medium" : "Low",
    },
    {
      label: "Leverage risk",
      note: ratios?.debtToEquity != null ? `Debt/equity ${ratios.debtToEquity.toFixed(0)}% vs market sample ${benchmark.debtToEquity?.toFixed(0) ?? "—"}%` : "No debt/equity data on file",
      level: ratios?.debtToEquity == null || benchmark.debtToEquity == null ? "Unknown" : ratios.debtToEquity > benchmark.debtToEquity * 1.5 ? "High" : ratios.debtToEquity > benchmark.debtToEquity ? "Medium" : "Low",
    },
    {
      label: "Momentum risk",
      note: ratios?.priceMomentum3m != null ? `${ratios.priceMomentum3m >= 0 ? "+" : ""}${ratios.priceMomentum3m.toFixed(1)}% over 3 months` : "No momentum data on file",
      level: ratios?.priceMomentum3m == null ? "Unknown" : ratios.priceMomentum3m < -10 ? "High" : ratios.priceMomentum3m < 0 ? "Medium" : "Low",
    },
    {
      label: "Drawdown risk",
      note: drawdown != null ? `${drawdown.toFixed(1)}% peak-to-trough, last 180 days` : "Not enough price history on file",
      level: drawdown == null ? "Unknown" : drawdown < -30 ? "High" : drawdown < -15 ? "Medium" : "Low",
    },
  ];

  const knownFactors = factors.filter((f) => f.level !== "Unknown");
  const radar = knownFactors.map((r) => ({ factor: r.label.replace(" risk", ""), safety: levelScore(r.level) }));
  const omittedCount = factors.length - knownFactors.length;

  return (
    <ReportSection number={5} title="Risk">
      <SubWidget
        number="5.1"
        title="Risk Snowflake"
        description="Five real checks (valuation, volatility, leverage, momentum, drawdown) — this is Continua's own risk framework, not Simply Wall St's published methodology. Higher is safer."
        right={<InfoTip>Factors Continua can't evaluate yet are left off this chart entirely rather than plotted as a false neutral score.</InfoTip>}
      >
        {knownFactors.length < 3 ? (
          <p className="text-xs text-muted-foreground py-6">Not enough real signals on file yet to plot a risk snowflake for {symbol} ({knownFactors.length}/{factors.length} factors known).</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="factor" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <Radar dataKey="safety" stroke={fx.strong} fill={fx.strong} fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {omittedCount > 0 && (
              <p className="text-[0.625rem] text-muted-foreground text-center mt-1">{omittedCount} factor{omittedCount > 1 ? "s" : ""} omitted — no data on file yet.</p>
            )}
          </>
        )}
      </SubWidget>

      <SubWidget number="5.2" title="Volatility &amp; Drawdown" description="Real, computed straight from daily price history — there's no sector-level series to benchmark against yet.">
        {candlesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading price history…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[0.625rem] text-muted-foreground mb-1">Annualized volatility</p>
              {volatility == null ? (
                <p className="text-xs text-muted-foreground">Not enough history yet</p>
              ) : (
                <p className="text-2xl font-bold tabular">{volatility.toFixed(1)}%</p>
              )}
            </div>
            <div>
              <p className="text-[0.625rem] text-muted-foreground mb-1">Max drawdown (180d)</p>
              {drawdown == null ? (
                <p className="text-xs text-muted-foreground">Not enough history yet</p>
              ) : (
                <p className="text-2xl font-bold tabular text-bear">{drawdown.toFixed(1)}%</p>
              )}
            </div>
          </div>
        )}
      </SubWidget>

      <SubWidget number="5.3" title="Key Risk Factors" description="Unknown means Continua doesn't have the data to evaluate that factor yet — not a real assessment.">
        <div className="divide-y divide-border/40">
          {factors.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{r.label}</p>
                <p className="text-[0.625rem] text-muted-foreground">{r.note}</p>
              </div>
              <Badge variant="outline" className="text-[0.625rem] shrink-0" style={{ color: levelColor(r.level), borderColor: `${levelColor(r.level)}55` }}>{r.level}</Badge>
            </div>
          ))}
        </div>
      </SubWidget>
    </ReportSection>
  );
}
