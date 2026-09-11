import { useState, useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fx } from "@/lib/chartPalette";
import { BarChartBlock } from "@/components/charts/BarChartBlock";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { KeyInfoUpdates } from "./KeyInfoUpdates";
import { useStockFinancials } from "@/hooks/useStockFinancials";

interface Props { symbol: string }
type Metric = "revenue" | "earnings" | "eps";

function pctChange(latest: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((latest - prior) / Math.abs(prior)) * 100;
}

// Pure — module-scope so it isn't a fresh function identity on every
// render (which would otherwise make the useMemo calls below re-run every
// time regardless of their dependency array).
function toRow(r: { fiscalYear: number; fiscalQuarter?: number | null; revenue: number; netIncome: number; eps: number }) {
  return {
    year: r.fiscalQuarter ? `Q${r.fiscalQuarter} '${String(r.fiscalYear).slice(2)}` : String(r.fiscalYear),
    Revenue: +(r.revenue / 1e9).toFixed(2),
    Earnings: +(r.netIncome / 1e9).toFixed(2),
    EPS: r.eps,
  };
}

/** Continua has no analyst forward-estimates feed, so — same as Simply
 *  Wall St shows for thinly-covered NSE stocks — this section is
 *  honestly mostly "n/a" rather than guessed. The one real thing shown
 *  is trailing (already-reported) growth: both as headline figures and
 *  as a real multi-year chart (financialsApi.getHistory), clearly
 *  labeled as trailing rather than a forecast. The chart renders its
 *  frame immediately and just shows "no history on file yet" until
 *  there are at least two fiscal years of real data to plot. */
export function FutureGrowthSection({ symbol }: Props) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const { history, isLoading } = useStockFinancials(symbol);
  // Real quarterly periods (not a synthetic split of the annual figure) —
  // feeds BarChartBlock's built-in Annual/Quarterly dropdown, which only
  // shows the toggle once this actually has rows.
  const { history: quarterlyHistory } = useStockFinancials(symbol, { periodType: "quarterly", limit: 5 });
  const [latest, prior] = [...history].sort((a, b) => b.fiscalYear - a.fiscalYear);
  const earningsGrowth = latest && prior ? pctChange(latest.netIncome, prior.netIncome) : null;
  const epsGrowth = latest && prior ? pctChange(latest.eps, prior.eps) : null;
  const revenueGrowth = latest && prior ? pctChange(latest.revenue, prior.revenue) : null;

  const chartData = useMemo(() => [...history].sort((a, b) => a.fiscalYear - b.fiscalYear).map(toRow), [history]);
  const quarterlyChartData = useMemo(
    () => [...quarterlyHistory].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0)).map(toRow),
    [quarterlyHistory],
  );
  const key = metric === "revenue" ? "Revenue" : metric === "earnings" ? "Earnings" : "EPS";
  const color = metric === "revenue" ? fx.revenue : metric === "earnings" ? fx.earnings : fx.eps;
  const yFmt = (v: number) => (metric === "eps" ? v.toFixed(1) : `${v}B`);
  const tipFmt = (v: number) => (metric === "eps" ? `KES ${v}` : `KES ${v}B`);

  return (
    <ReportSection number={2} title="Future Growth">
      <CriteriaChecklist
        checks={[{ label: "Analyst forecast coverage", status: "unknown" }]}
        narrative={`Continua doesn't currently have sufficient analyst coverage to forecast growth and revenue for ${symbol}. The trailing figures below are real, already-reported numbers, not a forecast.`}
      />

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4">Loading…</p>
      ) : (
        <KeyInfoUpdates
          rows={[
            { label: "Trailing earnings growth rate", value: earningsGrowth != null ? `${earningsGrowth >= 0 ? "+" : ""}${earningsGrowth.toFixed(1)}%` : "n/a", highlight: true },
            { label: "Trailing EPS growth rate", value: epsGrowth != null ? `${epsGrowth >= 0 ? "+" : ""}${epsGrowth.toFixed(1)}%` : "n/a", highlight: true },
            { label: "Trailing revenue growth rate", value: revenueGrowth != null ? `${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth.toFixed(1)}%` : "n/a" },
            { label: "Forecast return on equity", value: "n/a" },
            { label: "Analyst coverage", value: "None" },
            { label: "Last updated", value: "n/a" },
          ]}
          updates={[]}
          updatesTitle="Recent future growth updates"
        />
      )}

      <SubWidget number="2.1" title="Trailing Growth History" description="Real, already-reported revenue, earnings, and EPS — annual (last 3 years) or quarterly (last 5 quarters), not a projection.">
        {/* Chart frame renders unconditionally — BarChartBlock draws empty axes
            fine with an empty array, so a symbol with no history on file yet
            still shows the tool (an empty chart), not a text box in its place. */}
        <BarChartBlock
          title=""
          annual={chartData}
          allowQuarterly
          quarterly={quarterlyChartData}
          xKey="year"
          series={[{ key, label: metric === "eps" ? "EPS" : key, color }]}
          yFmt={yFmt}
          valueFmt={(v) => tipFmt(v)}
          note={isLoading ? "Loading financial history…" : chartData.length === 0 ? `No financial history on file for ${symbol} yet.` : undefined}
          right={
            <ToggleGroup type="single" size="sm" value={metric} onValueChange={(v) => v && setMetric(v as Metric)}>
              <ToggleGroupItem value="revenue" className="h-6 text-[10px] px-2">Revenue</ToggleGroupItem>
              <ToggleGroupItem value="earnings" className="h-6 text-[10px] px-2">Earnings</ToggleGroupItem>
              <ToggleGroupItem value="eps" className="h-6 text-[10px] px-2">EPS</ToggleGroupItem>
            </ToggleGroup>
          }
        />
      </SubWidget>

      <p className="text-[11px] text-muted-foreground">
        In this section Simply Wall St presents revenue and earnings growth projections based on consensus
        analyst estimates. Continua doesn't ingest an analyst-estimates feed, so this section honestly shows
        real trailing growth instead of an invented forecast.
      </p>
    </ReportSection>
  );
}