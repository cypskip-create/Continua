import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { useValuation } from "@/hooks/useValuation";

const finite = (value: number | null | undefined): number | null => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const percent = (value: number) => `${value.toFixed(1)}%`;

export function FundamentalsInsights({ symbol, currency }: { symbol: string; currency: string }) {
  const { history } = useStockFinancials(symbol, { periodType: "annual", limit: 10 });
  const { valuation } = useValuation(symbol);
  const [returnMetric, setReturnMetric] = useState<"ROE" | "ROA" | "ROCE">("ROE");
  const [forecastMetric, setForecastMetric] = useState<"Revenue" | "Net income">("Revenue");
  const [growth, setGrowth] = useState(5);
  const sorted = useMemo(() => [...history].sort((a, b) => a.fiscalYear - b.fiscalYear), [history]);
  const returns = sorted.map((row) => {
    const income = finite(row.netIncome);
    const operating = finite(row.operatingIncome);
    const equity = finite(row.totalEquity);
    const assets = finite(row.totalAssets);
    const liabilities = finite(row.currentLiabilities);
    const denominator = assets != null && liabilities != null ? assets - liabilities : null;
    return {
      year: String(row.fiscalYear),
      ROE: income != null && equity && equity > 0 ? income / equity * 100 : null,
      ROA: income != null && assets && assets > 0 ? income / assets * 100 : null,
      ROCE: operating != null && denominator && denominator > 0 ? operating / denominator * 100 : null,
    };
  }).filter((row) => row[returnMetric] != null);
  const latest = sorted[sorted.length - 1];
  const base = latest ? finite(forecastMetric === "Revenue" ? latest.revenue : latest.netIncome) : null;
  const forecast = base != null && base > 0 ? [
    { year: String(latest.fiscalYear), actual: base, scenario: base },
    ...[1, 2, 3].map((step) => ({ year: String(latest.fiscalYear + step), actual: null, scenario: base * (1 + growth / 100) ** step })),
  ] : [];
  const fairModels = valuation?.models.filter((model) => finite(model.fairValue) != null && finite(model.currentPrice) != null && model.currentPrice > 0) ?? [];
  const upside = fairModels.length ? fairModels.reduce((sum, model) => sum + ((model.fairValue! / model.currentPrice) - 1) * 100, 0) / fairModels.length : null;
  const stars = upside == null ? null : upside >= 30 ? 5 : upside >= 10 ? 4 : upside > -10 ? 3 : upside > -30 ? 2 : 1;
  const chartProps = { stroke: "hsl(var(--border))", strokeDasharray: "3 4" };
  const tooltipStyle = { background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: 8 };

  return <div className="space-y-0">
    <section className="border-t border-border/70 py-6 space-y-3">
      <h3 className="text-lg font-semibold">Continua Value Signal</h3>
      <p className="text-xs text-muted-foreground">An app-specific, model-based valuation indicator. It is not a Morningstar rating or investment recommendation.</p>
      {stars == null ? <p className="text-sm text-muted-foreground">Unrated — no usable model-based fair value is on file.</p> : <>
        <p className="text-2xl text-amber-500" aria-label={`${stars} out of 5 stars`}>{"★".repeat(stars)}<span className="text-muted-foreground/40">{"★".repeat(5 - stars)}</span></p>
        <p className="text-sm">Average model-implied upside: <strong>{upside!.toFixed(1)}%</strong> · {fairModels.length} model{fairModels.length === 1 ? "" : "s"}</p>
      </>}
      <p className="text-xs text-muted-foreground">5 stars: ≥30% potential upside; 4: 10–30%; 3: within ±10%; 2: 10–30% downside; 1: ≥30% downside. Equal-weighted available model fair values; no margin of safety or analyst judgement is implied.</p>
    </section>
    <section className="border-t border-border/70 py-6 space-y-4">
      <h3 className="text-lg font-semibold">Return on capital</h3>
      <div className="flex gap-2" role="tablist" aria-label="Return metric">{(["ROE", "ROA", "ROCE"] as const).map((metric) => <button key={metric} role="tab" aria-selected={returnMetric === metric} onClick={() => setReturnMetric(metric)} className={`rounded-md border px-3 py-1.5 text-xs ${returnMetric === metric ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>{metric}</button>)}</div>
      <p className="text-xs text-muted-foreground">{returnMetric === "ROCE" ? "Operating income ÷ (total assets − current liabilities)." : returnMetric === "ROE" ? "Net income ÷ total equity." : "Net income ÷ total assets."} Only reported annual periods with both inputs appear.</p>
      {returns.length ? <div className="h-56" role="img" aria-label={`${returnMetric} annual trend`}><ResponsiveContainer width="100%" height="100%"><LineChart data={returns}><CartesianGrid {...chartProps} /><XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tickFormatter={percent} tick={{ fontSize: 10 }} width={45} /><Tooltip formatter={(value: number) => percent(Number(value))} contentStyle={tooltipStyle} /><Line type="monotone" dataKey={returnMetric} stroke="#4f7cf5" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className="py-8 text-sm text-muted-foreground">No verified annual data for {returnMetric} yet.</p>}
    </section>
    <section className="border-t border-border/70 py-6 space-y-4">
      <h3 className="text-lg font-semibold">Scenario forecast</h3>
      <p className="text-xs text-muted-foreground">Illustrative calculation from the latest filed figure, not an analyst consensus or a prediction.</p>
      <div className="flex flex-wrap items-center gap-2"><div className="flex gap-2">{(["Revenue", "Net income"] as const).map((metric) => <button key={metric} onClick={() => setForecastMetric(metric)} className={`rounded-md border px-3 py-1.5 text-xs ${forecastMetric === metric ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>{metric}</button>)}</div><label className="ml-auto text-xs">Annual growth <input aria-label="Scenario annual growth percent" type="number" min="-50" max="50" step="1" value={growth} onChange={(event) => setGrowth(Math.max(-50, Math.min(50, Number(event.target.value) || 0)))} className="ml-2 w-16 rounded-md border border-border bg-background px-2 py-1" />%</label></div>
      {forecast.length ? <div className="h-56" role="img" aria-label={`${forecastMetric} scenario forecast`}><ResponsiveContainer width="100%" height="100%"><LineChart data={forecast}><CartesianGrid {...chartProps} /><XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value: number) => `${(value / 1e9).toFixed(1)}B`} tick={{ fontSize: 10 }} width={48} /><Tooltip formatter={(value: number) => `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} contentStyle={tooltipStyle} /><Line dataKey="actual" name="Reported" stroke="#4f7cf5" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} /><Line dataKey="scenario" name="Scenario" stroke="#f97316" strokeDasharray="5 4" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className="py-8 text-sm text-muted-foreground">No positive reported {forecastMetric.toLowerCase()} is on file to anchor a scenario.</p>}
    </section>
  </div>;
}
