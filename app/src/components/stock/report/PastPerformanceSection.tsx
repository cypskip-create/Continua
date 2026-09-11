import { useMemo } from "react";
import { Sankey, ResponsiveContainer, Layer, Rectangle, XAxis, YAxis, Tooltip, BarChart, Bar, Legend, Cell } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { KeyInfoUpdates } from "./KeyInfoUpdates";
import { SemiGauge } from "./SemiGauge";
import { BarChartBlock } from "@/components/charts/BarChartBlock";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { useResearch } from "@/hooks/useResearch";
import { useMarketBenchmark } from "@/hooks/useMarketBenchmark";
import { fx, tooltipStyle } from "@/lib/chartPalette";

interface Props { symbol: string; currency: string }

function pctChange(latest: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((latest - prior) / Math.abs(prior)) * 100;
}

// Pure — module-scope so it isn't a fresh function identity on every
// render (which would otherwise make the useMemo calls below re-run every
// time regardless of their dependency array).
function toRow(r: { fiscalYear: number; fiscalQuarter?: number | null; revenue: number; netIncome: number }) {
  return {
    year: r.fiscalQuarter ? `Q${r.fiscalQuarter} '${String(r.fiscalYear).slice(2)}` : String(r.fiscalYear),
    Revenue: +(r.revenue / 1e9).toFixed(2),
    Earnings: +(r.netIncome / 1e9).toFixed(2),
  };
}

export function PastPerformanceSection({ symbol, currency }: Props) {
  const { latest, history, isLoading } = useStockFinancials(symbol);
  // Real quarterly periods for the Revenue/Earnings chart's Annual/Quarterly
  // toggle — annual trims to the last 3 years, quarterly to the last 5
  // quarters (BarChartBlock's own defaults), never a synthetic split.
  const { history: quarterlyHistory } = useStockFinancials(symbol, { periodType: "quarterly", limit: 5 });
  const { research } = useResearch(symbol);
  const { averages: benchmark } = useMarketBenchmark();
  const ratios = research?.ratios;

  const areaData = useMemo(() => [...history].sort((a, b) => a.fiscalYear - b.fiscalYear).map(toRow), [history]);
  const quarterlyAreaData = useMemo(
    () => [...quarterlyHistory].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0)).map(toRow),
    [quarterlyHistory],
  );

  const [mostRecent, prior] = [...history].sort((a, b) => b.fiscalYear - a.fiscalYear);
  const earningsGrowth1y = mostRecent && prior ? pctChange(mostRecent.netIncome, prior.netIncome) : null;

  const sankeyData = latest ? {
    nodes: [{ name: "Revenue" }, { name: "Cost of Sales" }, { name: "Gross Profit" }, { name: "Earnings" }, { name: "Expenses" }],
    links: [
      { source: 0, target: 1, value: Math.max(1, latest.costOfRevenue ?? latest.revenue * 0.6) },
      { source: 0, target: 2, value: Math.max(1, latest.grossProfit ?? latest.revenue * 0.4) },
      { source: 2, target: 3, value: Math.max(1, latest.netIncome) },
      { source: 2, target: 4, value: Math.max(1, (latest.grossProfit ?? 0) - latest.netIncome) },
    ],
  } : {
    // Placeholder shape so the diagram frame always renders — same node
    // labels, equal-weight links, until a real income statement arrives.
    nodes: [{ name: "Revenue" }, { name: "Cost of Sales" }, { name: "Gross Profit" }, { name: "Earnings" }, { name: "Expenses" }],
    links: [
      { source: 0, target: 1, value: 1 },
      { source: 0, target: 2, value: 1 },
      { source: 2, target: 3, value: 1 },
      { source: 2, target: 4, value: 1 },
    ],
  };

  const checks = [
    { label: "Earnings grew over the last year", status: earningsGrowth1y == null ? "unknown" as const : earningsGrowth1y > 0 ? "pass" as const : "fail" as const },
    { label: "Revenue grew over the last year", status: mostRecent && prior ? (pctChange(mostRecent.revenue, prior.revenue)! > 0 ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "ROE above NSE sample", status: ratios?.roe != null && benchmark.roe != null ? (ratios.roe > benchmark.roe ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Positive net margin", status: ratios?.netMargin != null ? (ratios.netMargin > 0 ? "pass" as const : "fail" as const) : "unknown" as const },
  ];

  return (
    <ReportSection number={3} title="Past Performance">
      <CriteriaChecklist
        checks={checks}
        narrative={isLoading ? "Loading…" : `${symbol}'s earnings ${earningsGrowth1y != null ? `changed ${earningsGrowth1y >= 0 ? "+" : ""}${earningsGrowth1y.toFixed(1)}% over the last year` : "history is not on file yet"}. Real, already-reported figures — not a projection.`}
      />

      <KeyInfoUpdates
        rows={[
          { label: "Return on equity", value: ratios?.roe != null ? `${ratios.roe.toFixed(1)}%` : "n/a", highlight: true },
          { label: "1-year earnings growth", value: earningsGrowth1y != null ? `${earningsGrowth1y >= 0 ? "+" : ""}${earningsGrowth1y.toFixed(1)}%` : "n/a", highlight: true },
          { label: "Net margin", value: ratios?.netMargin != null ? `${(ratios.netMargin * 100).toFixed(1)}%` : "n/a" },
          { label: "Last reported period", value: mostRecent ? `FY${mostRecent.fiscalYear}` : "n/a" },
        ]}
        updates={[]}
        updatesTitle="Recent past performance updates"
      />

      <SubWidget number="3.1" title="Revenue & Expenses Breakdown" description={`How ${symbol} makes and spends money, based on the latest reported period.`}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <Sankey data={sankeyData} nodeWidth={10} nodePadding={20} link={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.25 }}
              node={(props: any) => (
                <Layer><Rectangle {...props} fill="hsl(217 91% 60%)" /><text x={props.x + props.width + 6} y={props.y + props.height / 2} fontSize={10} fill="hsl(var(--foreground))" dominantBaseline="middle">{props.payload.name}</text></Layer>
              )}
            />
          </ResponsiveContainer>
        </div>
        {!latest && <p className="text-[10px] text-muted-foreground mt-1">No income statement on file yet — shown with placeholder proportions until one arrives.</p>}
      </SubWidget>

      <SubWidget number="3.2" title="Earnings and Revenue History" description="Real revenue and earnings from Continua's financial statements — annual (last 3 years) or quarterly (last 5 quarters).">
        <BarChartBlock
          title=""
          annual={areaData}
          allowQuarterly
          quarterly={quarterlyAreaData}
          xKey="year"
          series={[{ key: "Revenue", label: "Revenue", color: fx.revenue }, { key: "Earnings", label: "Earnings", color: fx.earnings }]}
          yFmt={(v) => `${v}B`}
          valueFmt={(v) => `${currency} ${v}B`}
          note={areaData.length === 0 ? "No history on file yet." : undefined}
        />
      </SubWidget>

      <SubWidget number="3.3" title="Free Cash Flow vs Earnings Analysis" description="Real current-period figures — Continua doesn't have a multi-year cash-flow time series yet, so this is one period's bridge, not a bridge with D&A/stock-comp add-backs Continua doesn't ingest.">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={!latest ? [] : [
              { name: "Earnings", v: latest.netIncome / 1e9 },
              { name: "Operating CF", v: latest.operatingCashFlow / 1e9 },
              { name: "Capex", v: -(latest.capex ?? 0) / 1e9 },
              { name: "Free Cash Flow", v: (latest.freeCashFlow ?? 0) / 1e9 },
            ]}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v: number) => [`${currency}${v.toFixed(2)}B`, ""]} contentStyle={tooltipStyle} />
              <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                {["Earnings", "Operating CF", "Capex", "Free Cash Flow"].map((n, i) => (
                  <Cell key={n} fill={[fx.earnings, fx.revenue, fx.negative, "#a855f7"][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!latest && <p className="text-xs text-muted-foreground mt-1">No cash flow statement on file yet — chart will populate once one is.</p>}
      </SubWidget>

      <SubWidget number="3.4" title="Past Earnings Growth Analysis" description="Company growth vs the NSE market-cap sample — Continua doesn't have a sector-average growth figure yet.">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: "1Y Earnings Growth", Company: earningsGrowth1y ?? 0, "NSE Top 15": 0 },
            ]}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} unit="%" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, ""]} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Company" fill={fx.revenue} radius={[4, 4, 0, 0]} />
              <Bar dataKey="NSE Top 15" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">No real sector-average growth figure yet — the comparison bar shows 0 rather than a guess.</p>
      </SubWidget>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SubWidget number="3.5" title="ROE"><SemiGauge label="ROE" value={ratios?.roe ?? null} industryValue={benchmark.roe} /></SubWidget>
        <SubWidget number="3.6" title="ROA"><SemiGauge label="ROA" value={ratios?.roa ?? null} industryValue={null} max={20} /></SubWidget>
        <SubWidget number="3.7" title="ROCE">
          <SemiGauge label="ROCE" value={null} industryValue={null} max={30} />
          <p className="text-[10px] text-muted-foreground text-center mt-1">Not currently computed for NSE holdings.</p>
        </SubWidget>
      </div>
    </ReportSection>
  );
}