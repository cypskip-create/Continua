import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { useDividendHistory } from "@/hooks/useDividendHistory";
import { useOwnership } from "@/hooks/useOwnership";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useCorporateActions } from "@/hooks/useCorporateActions";
import { useResearch } from "@/hooks/useResearch";
import type { FinancialHistoryEntry, FiscalPeriodType } from "@/api/types";
import { EarningsFundamentals } from "./EarningsFundamentals";
import { FundamentalsInsights } from "./FundamentalsInsights";
import { StockSnowflake } from "./tabs/StockSnowflake";
import { ValuationSection } from "./report/ValuationSection";
import { FutureGrowthSection } from "./report/FutureGrowthSection";
import { PastPerformanceSection } from "./report/PastPerformanceSection";
import { FinancialHealthSection } from "./report/FinancialHealthSection";
import { RiskSection } from "./report/RiskSection";
import { ManagementSection } from "./report/ManagementSection";
import { Link } from "react-router-dom";

type Panel = "financials" | "shareholders" | "dividends" | "profile";
type Metric = { label: string; get: (row: FinancialHistoryEntry) => number | null | undefined; percent?: boolean };
const income: Metric[] = [
  { label: "Revenue", get: r => r.revenue }, { label: "Gross profit", get: r => r.grossProfit },
  { label: "Operating profit", get: r => r.operatingIncome }, { label: "Net income", get: r => r.netIncome },
  { label: "EPS", get: r => r.eps },
];
const balance: Metric[] = [
  { label: "Assets", get: r => r.totalAssets }, { label: "Liabilities", get: r => r.totalLiabilities },
  { label: "Equity", get: r => r.totalEquity }, { label: "Cash", get: r => r.cash },
  { label: "Debt", get: r => r.totalDebt },
];
const cashFlow: Metric[] = [
  { label: "Operating cash flow", get: r => r.operatingCashFlow },
  { label: "Investing cash flow", get: r => r.investingCashFlow },
  { label: "Financing cash flow", get: r => r.financingCashFlow },
  { label: "Free cash flow", get: r => r.freeCashFlow }, { label: "Capex", get: r => r.capex },
];
const indicators: Metric[] = [
  { label: "EPS", get: r => r.eps },
  { label: "Gross margin", get: r => r.grossProfit != null && Number(r.revenue) ? Number(r.grossProfit) / Number(r.revenue) * 100 : null, percent: true },
  { label: "Net margin", get: r => r.netIncome != null && Number(r.revenue) ? Number(r.netIncome) / Number(r.revenue) * 100 : null, percent: true },
  { label: "Current ratio", get: r => r.currentAssets != null && Number(r.currentLiabilities) ? Number(r.currentAssets) / Number(r.currentLiabilities) : null },
  { label: "ROE", get: r => r.netIncome != null && Number(r.totalEquity) ? Number(r.netIncome) / Number(r.totalEquity) * 100 : null, percent: true },
  { label: "ROA", get: r => r.netIncome != null && Number(r.totalAssets) ? Number(r.netIncome) / Number(r.totalAssets) * 100 : null, percent: true },
];

function compact(value: number, currency = "KES") {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const scale = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  const suffix = scale === 1e12 ? "T" : scale === 1e9 ? "B" : scale === 1e6 ? "M" : scale === 1e3 ? "K" : "";
  return `${currency} ${(value / scale).toFixed(scale === 1 ? 2 : 1)}${suffix}`;
}
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const tabClass = (active: boolean) => `shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${active ? "contrast-active" : "text-muted-foreground hover:text-foreground"}`;

function MetricChart({ title, metrics, history, currency, periodType }: { title: string; metrics: Metric[]; history: FinancialHistoryEntry[]; currency: string; periodType: FiscalPeriodType }) {
  const [selected, setSelected] = useState(0);
  const metric = metrics[selected] ?? metrics[0];
  const points = history.map(row => {
    const previousYear = history.find(previous => previous.fiscalYear === row.fiscalYear - 1 && (previous.fiscalQuarter ?? null) === (row.fiscalQuarter ?? null));
    const value = metric.get(row) == null ? null : Number(metric.get(row));
    const previousValue = previousYear ? metric.get(previousYear) : null;
    return {
      period: periodType === "quarterly" ? `Q${row.fiscalQuarter} ${row.fiscalYear}` : String(row.fiscalYear),
      value: value != null && Number.isFinite(value) ? value : null,
      yoy: value != null && previousValue != null && Number(previousValue) !== 0 ? (value - Number(previousValue)) / Math.abs(Number(previousValue)) * 100 : null,
    };
  });
  const hasValues = points.some(row => row.value != null);
  const previous = points[points.length - 2]?.value;
  const current = points[points.length - 1]?.value;
  const change = previous != null && current != null && previous !== 0 ? (current - previous) / Math.abs(previous) * 100 : null;
  return <section className="border-t border-border/70 py-6 space-y-4">
    <div className="flex items-baseline justify-between gap-3"><h3 className="text-lg font-semibold">{title}</h3><span className="text-xs text-muted-foreground">{periodType === "annual" ? "Annual" : "Quarterly"}</span></div>
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label={`${title} metric`}>
      {metrics.map((item, index) => <button key={item.label} role="tab" aria-selected={selected === index} onClick={() => setSelected(index)} className={tabClass(selected === index)}>{item.label}</button>)}
    </div>
    {hasValues ? <>
      <div className="flex items-baseline gap-3"><span className="text-xl font-semibold tabular-nums">{current == null ? "—" : metric.percent ? `${current.toFixed(1)}%` : metric.label === "EPS" || metric.label === "Current ratio" ? current.toFixed(2) : compact(current, currency)}</span>{change != null && <span className={`text-xs font-medium ${change >= 0 ? "text-bull" : "text-bear"}`}>{pct(change)} vs prior period</span>}</div>
      <div className="h-52 w-full" role="img" aria-label={`${metric.label} history`}>
        <ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
          <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis yAxisId="actual" hide domain={[(minimum: number) => Math.min(0, minimum), "auto"]} />
          <YAxis yAxisId="growth" orientation="right" hide domain={["auto", "auto"]} />
          <Tooltip formatter={(v: number, name: string) => name === "YoY" || metric.percent ? `${Number(v).toFixed(1)}%` : metric.label === "EPS" || metric.label === "Current ratio" ? Number(v).toFixed(2) : compact(Number(v), currency)} contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
          <Bar yAxisId="actual" dataKey="value" name={metric.label} fill="#4f7cf5" barSize={24} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="growth" dataKey="yoy" name="YoY" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </ComposedChart></ResponsiveContainer>
      </div>
      <p className="text-center text-xs text-muted-foreground"><span className="text-blue-500">●</span> {metric.label} · <span className="text-orange-500">●</span> Year-over-year change</p>
      <div className="grid grid-cols-5 gap-1 text-center text-[0.625rem] tabular-nums text-muted-foreground">{points.slice(-5).map(row => <div key={row.period}><p>{row.period}</p><p className="text-foreground">{row.value == null ? "—" : metric.percent ? `${row.value.toFixed(1)}%` : metric.label === "EPS" || metric.label === "Current ratio" ? row.value.toFixed(2) : compact(row.value, currency)}</p></div>)}</div>
    </> : <p className="py-10 text-center text-sm text-muted-foreground">No reported {metric.label.toLowerCase()} history is on file yet.</p>}
  </section>;
}

export function StockFundamentals({ symbol, currency, price = 0, name = symbol, sector = "", marketCap = "—" }: { symbol: string; currency: string; price?: number; name?: string; sector?: string; marketCap?: string }) {
  const [panel, setPanel] = useState<Panel>("financials");
  const [periodType, setPeriodType] = useState<FiscalPeriodType>("annual");
  const { history, isLoading } = useStockFinancials(symbol, { periodType, limit: 10 });
  const { history: dividends } = useDividendHistory(symbol);
  const { topShareholders } = useOwnership(symbol);
  const { profile } = useCompanyProfile(symbol);
  const { actions } = useCorporateActions(symbol);
  const { research } = useResearch(symbol);
  const sorted = useMemo(() => [...history].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0)), [history]);
  const recent = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 2];
  const totalKnown = topShareholders.reduce((sum, row) => sum + Math.max(0, row.pct), 0);
  return <div className="space-y-0">
    <div className="sticky top-[97px] z-20 flex gap-1 overflow-x-auto scrollbar-hide border-b border-border/70 py-2 bg-background/95 backdrop-blur-xl" role="tablist" aria-label="Fundamentals category">
      {([ ["financials", "Financials"], ["shareholders", "Shareholders"], ["dividends", "Dividends"], ["profile", "Profile"] ] as const).map(([id, label]) =>
        <button key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={tabClass(panel === id)}>{label}</button>)}
    </div>
    {panel === "financials" && <>
      <section className="py-6"><StockSnowflake symbol={symbol} /></section>
      <Link to={`/engine?symbol=${encodeURIComponent(symbol)}`} className="flex items-center justify-between border-y border-border/70 py-4"><div><p className="text-sm font-semibold">Continua Engine</p><p className="text-xs text-muted-foreground">Company briefing, scenarios, technical analysis and alerts</p></div><span className="text-xs font-semibold text-primary">Premium →</span></Link>
      <EarningsFundamentals symbol={symbol} currency={currency} />
      <div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h3 className="text-lg font-semibold">Reported financials</h3><p className="text-xs text-muted-foreground">{recent?.reportedAt ? `Filed ${new Date(recent.reportedAt).toLocaleDateString()}` : "Company filings on record"} · {currency}</p></div><div className="flex gap-1" role="tablist" aria-label="Financial period"><button role="tab" aria-selected={periodType === "annual"} onClick={() => setPeriodType("annual")} className={tabClass(periodType === "annual")}>Annual</button><button role="tab" aria-selected={periodType === "quarterly"} onClick={() => setPeriodType("quarterly")} className={tabClass(periodType === "quarterly")}>Quarterly</button></div></div>
      {isLoading && !recent && <p className="py-8 text-sm text-muted-foreground">Loading reported statements…</p>}
      {recent && <section className="grid grid-cols-2 gap-4 pb-6 text-sm"><div><p className="text-muted-foreground">Revenue</p><p className="font-semibold">{recent.revenue == null ? "—" : compact(Number(recent.revenue), currency)}</p>{recent.revenue != null && prior?.revenue && <p className="text-xs text-muted-foreground">{pct(((Number(recent.revenue) - Number(prior.revenue)) / Math.abs(Number(prior.revenue))) * 100)} vs prior</p>}</div><div><p className="text-muted-foreground">Net income</p><p className="font-semibold">{recent.netIncome == null ? "—" : compact(Number(recent.netIncome), currency)}</p>{recent.netIncome != null && prior?.netIncome && <p className="text-xs text-muted-foreground">{pct(((Number(recent.netIncome) - Number(prior.netIncome)) / Math.abs(Number(prior.netIncome))) * 100)} vs prior</p>}</div></section>}
      <MetricChart key={`income-${periodType}`} title="Income statement" metrics={income} history={sorted} currency={currency} periodType={periodType} />
      <section className="border-t border-border/70 py-6 space-y-5"><div><h3 className="text-lg font-semibold">Revenue by segment</h3><p className="mt-2 text-sm text-muted-foreground">No verified business-segment revenue figures are on file. A chart will appear when the company publishes a sourced breakdown.</p></div><div className="border-t border-border/60 pt-5"><h3 className="text-lg font-semibold">Geographic revenue</h3><p className="mt-2 text-sm text-muted-foreground">No verified revenue-by-region figures are on file. We do not infer these from the company’s operating locations.</p></div></section>
      <MetricChart key={`balance-${periodType}`} title="Balance sheet" metrics={balance} history={sorted} currency={currency} periodType={periodType} />
      <MetricChart key={`cash-${periodType}`} title="Cash flows" metrics={cashFlow} history={sorted} currency={currency} periodType={periodType} />
      <MetricChart key={`indicators-${periodType}`} title="Financial indicators" metrics={indicators} history={sorted} currency={currency} periodType={periodType} />
      <FundamentalsInsights symbol={symbol} currency={currency} />
      <section className="border-t border-border/70 py-6"><ValuationSection symbol={symbol} name={name} sector={sector || profile?.company.sectorName || ""} price={price} currency={currency} /></section>
      <section className="border-t border-border/70 py-6"><FutureGrowthSection symbol={symbol} /></section>
      <details className="border-t border-border/70 py-5"><summary className="cursor-pointer text-base font-semibold">Past performance</summary><div className="pt-5"><PastPerformanceSection symbol={symbol} currency={currency} /></div></details>
      <details className="border-t border-border/70 py-5"><summary className="cursor-pointer text-base font-semibold">Financial health</summary><div className="pt-5"><FinancialHealthSection symbol={symbol} currency={currency} /></div></details>
      <details className="border-t border-border/70 py-5"><summary className="cursor-pointer text-base font-semibold">Risk analysis</summary><div className="pt-5"><RiskSection symbol={symbol} /></div></details>
      <section className="border-t border-border/70 py-6"><h3 className="text-lg font-semibold">Operational efficiency</h3><p className="mt-2 text-sm text-muted-foreground">{profile?.company.employees && recent?.revenue ? `Latest revenue per employee: ${compact(Number(recent.revenue) / Number(profile.company.employees.replace(/[^\d.]/g, "")), currency)}.` : "Employee history is not available for a verified trend yet."}</p></section>
    </>}
    {panel === "shareholders" && <section className="py-6"><h3 className="text-lg font-semibold">Shareholders</h3>{topShareholders.length ? <><div className="flex h-2 overflow-hidden rounded-full mt-5 bg-muted">{topShareholders.map((holder, index) => <div key={`${holder.name}-${index}`} style={{ width: `${Math.max(0, holder.pct)}%`, background: ["#4f7cf5", "#22c3d6", "#84cc16", "#facc15", "#fb923c"][index % 5] }} />)}</div><div className="divide-y divide-border/70 mt-4">{topShareholders.map(holder => <div key={holder.name} className="flex justify-between gap-4 py-3 text-sm"><span className="truncate">{holder.name}<span className="block text-xs text-muted-foreground capitalize">{holder.type}</span></span><span className="font-semibold tabular-nums">{holder.pct.toFixed(2)}%</span></div>)}{totalKnown < 100 && <div className="flex justify-between py-3 text-sm"><span>Other shareholders</span><span className="font-semibold">{Math.max(0, 100 - totalKnown).toFixed(2)}%</span></div>}</div></> : <p className="py-10 text-sm text-muted-foreground">No verified shareholder disclosures are on file yet.</p>}</section>}
    {panel === "dividends" && <><section className="py-6"><h3 className="text-lg font-semibold">Dividends</h3><div className="grid grid-cols-2 gap-4 mt-5 text-sm"><div><p className="text-muted-foreground">Latest dividend per share</p><p className="text-lg font-semibold">{dividends.length ? compact(dividends[dividends.length - 1].dps, currency) : "—"}</p></div><div><p className="text-muted-foreground">Dividend yield</p><p className="text-lg font-semibold">{research?.ratios.dividendYield != null ? `${(Number(research.ratios.dividendYield) * 100).toFixed(2)}%` : "—"}</p></div></div>{dividends.length ? <div className="mt-6 space-y-3">{dividends.map(row => <div key={row.year} className="flex justify-between border-b border-border/60 pb-2 text-sm"><span>{row.year}</span><span className="font-semibold">{compact(row.dps, currency)}</span></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">No verified dividend payments are on file.</p>}</section><section className="border-t border-border/70 py-6"><h3 className="text-lg font-semibold">Stock splits and actions</h3>{actions.filter(a => a.type === "split" || a.type === "bonus_issue").length ? actions.filter(a => a.type === "split" || a.type === "bonus_issue").map(a => <div key={a.id} className="flex justify-between border-b border-border/60 py-3 text-sm"><span className="capitalize">{a.type.replace("_", " ")}</span><span>{new Date(a.effectiveDate ?? a.announcedAt).toLocaleDateString()}</span></div>) : <p className="mt-4 text-sm text-muted-foreground">No verified splits are on file.</p>}</section></>}
    {panel === "profile" && <section className="py-6 space-y-6"><div><h3 className="text-lg font-semibold">Company overview</h3><p className="mt-3 text-sm leading-relaxed">{profile?.company.description || "A verified company description is not available yet."}</p></div><div className="border-t border-border/70 pt-5"><h3 className="text-lg font-semibold">Category and leadership</h3><dl className="mt-4 divide-y divide-border/70 text-sm">{[["Industry", profile?.company.sectorName], ["Headquarters", profile?.company.headquarters], ["Founded", profile?.company.founded], ["CEO", profile?.company.ceo], ["Employees", profile?.company.employees]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value || "—"}</dd></div>)}</dl></div></section>}
    {panel === "profile" && <section className="border-t border-border/70 py-6"><ManagementSection symbol={symbol} /></section>}
  </div>;
}
