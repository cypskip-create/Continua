import { useState } from "react";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { KeyInfoUpdates } from "./KeyInfoUpdates";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { PremiumDetail } from "@/components/engine/PremiumDetail";
import { GrowthWorkbench } from "../ForecastWorkbenches";
import { FinancialTrend, financialTab } from '../FinancialStatementExplorer';
import { statementMetrics } from '@/lib/financialPresentation';

interface Props { symbol: string; currency?:string; basic?:boolean }
type Metric = "revenue" | "earnings" | "eps";

function pctChange(latest: number, prior: number): number | null {
  if (typeof latest!=='number' || typeof prior!=='number' || !Number.isFinite(latest) || !Number.isFinite(prior) || prior === 0) return null;
  return ((latest - prior) / Math.abs(prior)) * 100;
}

/** Continua has no analyst forward-estimates feed, so — same as Simply
 *  Wall St shows for thinly-covered NSE stocks — this section is
 *  honestly mostly "n/a" rather than guessed. The one real thing shown
 *  is trailing (already-reported) growth: both as headline figures and
 *  as a real multi-year chart (financialsApi.getHistory), clearly
 *  labeled as trailing rather than a forecast. The chart renders its
 *  frame immediately and just shows "no history on file yet" until
 *  there are at least two fiscal years of real data to plot. */
export function FutureGrowthSection({ symbol, currency="KES", basic=false }: Props) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const [period, setPeriod] = useState<'annual'|'quarterly'>('annual');
  const { history, isLoading } = useStockFinancials(symbol,{publisherObservations:true});
  // Only actual quarterly disclosures; annual totals are never split into
  // invented quarters. Both views use the same shared financial chart.
  const { history: quarterlyHistory } = useStockFinancials(symbol, { periodType: "quarterly", limit: 5 });
  const latest = [...history].sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
  const prior = latest ? history.find(row => row.fiscalYear === latest.fiscalYear - 1) : undefined;
  const earningsGrowth = latest && prior ? pctChange(latest.netIncome, prior.netIncome) : null;
  const epsGrowth = latest && prior ? pctChange(latest.eps, prior.eps) : null;
  const revenueGrowth = latest && prior ? pctChange(latest.revenue, prior.revenue) : null;

  return (
    <ReportSection number={2} title="Future Growth">
      {history.some(r=>r.basis)&&<p className="text-xs text-muted-foreground">Trailing history includes publisher observations. Analyst estimates remain separate and are not inferred from historical growth.</p>}
      <CriteriaChecklist
        checks={[{ label: "Analyst forecast coverage", status: "unknown" }]}
        narrative={`Forward growth rates and analyst coverage counts are not supplied for ${symbol}. Any sourced revenue/EPS estimates appear in Financial estimates. The trailing figures below are already-reported numbers, not a forecast.`}
      />

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4">Loading…</p>
      ) : (
        <KeyInfoUpdates
          rows={[
            { label: "Trailing earnings growth rate", value: earningsGrowth != null ? `${earningsGrowth >= 0 ? "+" : ""}${earningsGrowth.toFixed(2)}%` : "n/a", highlight: true },
            { label: "Trailing EPS growth rate", value: epsGrowth != null ? `${epsGrowth >= 0 ? "+" : ""}${epsGrowth.toFixed(2)}%` : "n/a", highlight: true },
            { label: "Trailing revenue growth rate", value: revenueGrowth != null ? `${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth.toFixed(2)}%` : "n/a" },
            { label: "Forecast return on equity", value: "n/a" },
            { label: "Analyst coverage count", value: "Not supplied" },
            { label: "Last updated", value: "n/a" },
          ]}
          updates={[]}
          updatesTitle="Recent future growth updates"
        />
      )}

      <SubWidget number="2.1" title="Trailing Growth History" description="Reported revenue, earnings and EPS for the last five available periods. YoY needs the matching period one year earlier; gaps are not annual growth.">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2"><div role="tablist" aria-label="Trailing history metric">{(['revenue','earnings','eps'] as const).map(value => <button key={value} role="tab" aria-selected={metric===value} className={financialTab(metric===value)} onClick={()=>setMetric(value)}>{value==='eps'?'EPS':value==='earnings'?'Earnings':'Revenue'}</button>)}</div><div role="tablist" aria-label="Trailing history period">{(['annual','quarterly'] as const).map(value=><button key={value} role="tab" aria-selected={period===value} className={financialTab(period===value)} onClick={()=>setPeriod(value)}>{value==='annual'?'Annual':'Quarterly'}</button>)}</div></div>
        <FinancialTrend history={period==='annual'?history:quarterlyHistory} metric={statementMetrics['Income statement'][metric==='revenue'?0:metric==='earnings'?5:7]} title="Trailing growth history"/>
      </SubWidget>

      <p className="text-[0.6875rem] text-muted-foreground">
        These are reported historical values. Sourced estimates, where available, are shown separately;
        no growth consensus or analyst coverage count is inferred from price movement.
      </p>
      {basic&&<PremiumDetail title="Future growth research" symbol={symbol} currency={currency}><GrowthWorkbench symbol={symbol} currency={currency}/></PremiumDetail>}
    </ReportSection>
  );
}
