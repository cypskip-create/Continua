import { CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, PieChart, Pie } from "recharts";
import { Fundamentals } from "@/data/stockFundamentals";
import { fx, axisStyle, gridStyle } from "@/lib/chartPalette";
import { ColorTooltip, ChartKey } from "@/components/charts/ChartTooltip";
import { BarChartBlock } from "@/components/charts/BarChartBlock";


const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{children}</p>
);


// Circular score badge
function ScoreDial({ score, max, label, sub, color }: { score: number; max: number; label: string; sub?: string; color: string }) {
  const pct = Math.max(0, Math.min(1, score / max));
  const data = [{ v: pct }, { v: 1 - pct }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="v" innerRadius={32} outerRadius={44} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={color} />
              <Cell fill="hsl(var(--muted))" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular" style={{ color }}>{score.toFixed(score % 1 === 0 ? 0 : 1)}</span>
          <span className="text-[0.5625rem] text-muted-foreground">/ {max}</span>
        </div>
      </div>
      <p className="text-[0.6875rem] font-semibold mt-1">{label}</p>
      {sub && <p className="text-[0.625rem] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ScoresTab({ fundamentals }: { fundamentals: Fundamentals }) {
  const piotroski = fundamentals.piotroski;
  const altman = fundamentals.altmanZ;
  const altmanColor = altman.band === "safe" ? fx.strong : altman.band === "grey" ? fx.ok : fx.weak;
  const piotroColor = piotroski.score >= 7 ? fx.strong : piotroski.score >= 4 ? fx.ok : fx.weak;

  // Derive composite scores from existing datasets
  const healthOk = fundamentals.healthChecks.filter(c => c.ok).length;
  const financialStrength = Math.round((healthOk / fundamentals.healthChecks.length) * 10);
  const latestMargins = fundamentals.marginsHistory[fundamentals.marginsHistory.length - 1];
  const profitability = Math.round(Math.min(10, Math.max(0, latestMargins.net / 2.5)));
  const growth3y = fundamentals.growthMetrics[0].value;
  const growthScore = Math.round(Math.min(10, Math.max(0, growth3y / 2.5)));

  const latestReturns = fundamentals.returnsHistory[fundamentals.returnsHistory.length - 1];
  const prevReturns = fundamentals.returnsHistory[fundamentals.returnsHistory.length - 2];
  const returnTrend = latestReturns.roe - prevReturns.roe;

  const surprises = fundamentals.earningsSurprises.map(e => ({
    ...e,
    actualColor: e.actual >= e.estimate ? fx.positive : fx.negative,
  }));


  return (
    <div className="space-y-8">
      <div className="flat-section flex items-start gap-2 rounded-xl bg-muted/40 p-3">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[0.65625rem] text-muted-foreground leading-snug">
          <span className="font-semibold text-foreground">Demonstration data.</span> Piotroski F-Score,
          Altman Z-Score, and the composite dials below need multiple years of full balance-sheet
          history — Continua's data layer currently gives one real current-period snapshot per
          company, not the multi-year time series this scoring needs. Shown with real numbers
          elsewhere in this app (Snowflake, Health, Growth tabs) instead.
        </p>
      </div>

      {/* Composite dials */}
      <div>
        <Eyebrow>Institutional Scorecard</Eyebrow>
        <div className="border-t border-border/60 pt-4 grid grid-cols-3 sm:grid-cols-5 gap-3">
          <ScoreDial score={piotroski.score} max={9} label="Piotroski F" sub={piotroski.score >= 7 ? "Strong" : piotroski.score >= 4 ? "Neutral" : "Weak"} color={piotroColor} />
          <ScoreDial score={altman.score} max={5} label="Altman Z" sub={altman.band === "safe" ? "Safe zone" : altman.band === "grey" ? "Grey zone" : "Distress"} color={altmanColor} />
          <ScoreDial score={financialStrength} max={10} label="Financial Strength" color={financialStrength >= 7 ? fx.strong : financialStrength >= 4 ? fx.ok : fx.weak} />
          <ScoreDial score={profitability} max={10} label="Profitability" color={profitability >= 7 ? fx.strong : profitability >= 4 ? fx.ok : fx.weak} />
          <ScoreDial score={growthScore} max={10} label="Growth" color={growthScore >= 7 ? fx.strong : growthScore >= 4 ? fx.ok : fx.weak} />
        </div>
      </div>

      {/* Piotroski checklist */}
      <div>
        <Eyebrow>Piotroski F-Score Breakdown</Eyebrow>
        <div className="border-t border-border/60">
          {piotroski.checks.map(c => (
            <div key={c.label} className="flex items-center gap-2 py-2.5 border-b border-border/40 last:border-0">
              {c.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: fx.positive }} />
                : <XCircle className="h-4 w-4 shrink-0" style={{ color: fx.negative }} />}
              <span className="text-xs">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROE / ROA / ROIC history */}
      <div>
        <div className="flex items-center justify-between">
          <Eyebrow>Return on Capital — 6yr Trend</Eyebrow>
          <span className="text-[0.625rem] font-semibold tabular flex items-center gap-1" style={{ color: returnTrend >= 0 ? fx.positive : fx.negative }}>
            {returnTrend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            ROE {returnTrend >= 0 ? "+" : ""}{returnTrend.toFixed(1)}pp YoY
          </span>
        </div>
        <div className="h-64 border-t border-border/60 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fundamentals.returnsHistory} margin={{ top: 10, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="year" {...axisStyle} />
              <YAxis {...axisStyle} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ColorTooltip format={(v) => `${(+v).toFixed(1)}%`} />} />
              <Line type="monotone" dataKey="roe" stroke={fx.equity} strokeWidth={2.2} dot={{ r: 3, fill: fx.equity }} name="ROE" />
              <Line type="monotone" dataKey="roa" stroke={fx.assets} strokeWidth={2.2} dot={{ r: 3, fill: fx.assets }} name="ROA" />
              <Line type="monotone" dataKey="roic" stroke={fx.operatingIncome} strokeWidth={2.2} dot={{ r: 3, fill: fx.operatingIncome }} name="ROIC" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ChartKey items={[
          { label: "ROE", color: fx.equity },
          { label: "ROA", color: fx.assets },
          { label: "ROIC", color: fx.operatingIncome },
        ]} />
      </div>

      {/* Earnings surprise history */}
      <BarChartBlock
        title="Earnings Surprise History"
        annual={surprises}
        annualCount={5}
        xKey="quarter"
        series={[
          { key: "estimate", label: "Analyst estimate", color: fx.forecast },
          { key: "actual", label: "Actual EPS", color: fx.positive },
        ]}
        colorFor={(row, s) => (s.key === "estimate" ? fx.forecast : row.actualColor)}
        valueFmt={(v) => `KES ${v}`}
      />



      {/* Revenue segmentation */}
      <div>
        <Eyebrow>Revenue by Segment</Eyebrow>
        <div className="border-t border-border/60 pt-3 space-y-2">
          {fundamentals.revenueSegments.map(s => {
            const total = fundamentals.revenueSegments.reduce((a, b) => a + b.value, 0);
            const pct = (s.value / total) * 100;
            return (
              <div key={s.name} className="flex items-center gap-3 text-xs">
                <span className="w-20 truncate">{s.name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                </div>
                <span className="w-10 text-right font-bold tabular">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Geographic revenue */}
      <div>
        <Eyebrow>Geographic Revenue</Eyebrow>
        <div className="border-t border-border/60 pt-3">
          <div className="flex h-6 w-full rounded-md overflow-hidden">
            {fundamentals.geographicRevenue.map(g => {
              const total = fundamentals.geographicRevenue.reduce((a, b) => a + b.value, 0);
              const pct = (g.value / total) * 100;
              return <div key={g.region} className="h-full" style={{ width: `${pct}%`, background: g.color }} title={`${g.region}: ${pct.toFixed(1)}%`} />;
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4">
            {fundamentals.geographicRevenue.map(g => {
              const total = fundamentals.geographicRevenue.reduce((a, b) => a + b.value, 0);
              const pct = (g.value / total) * 100;
              return (
                <div key={g.region} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: g.color }} />
                    <span className="truncate">{g.region}</span>
                  </div>
                  <span className="font-bold tabular">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
