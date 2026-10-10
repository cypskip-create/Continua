import { useState } from "react";
import type { StockEarningsEvent } from "@/api/types";
import { estimateResearch } from "@/lib/forecastResearch";
import { financialNumber, financialPercent, financialPeriod } from "@/lib/financialPresentation";
import { ResearchTable } from "./ForecastWorkbenches";

export function EstimateAudit({events,currency}: {events:StockEarningsEvent[];currency:string}) {
  const [metric,setMetric]=useState<"revenue"|"eps">("revenue"),[reportedOnly,setReportedOnly]=useState(false);
  const ordered=[...events].filter(e=>!reportedOnly||!!e.reportedDate).sort((a,b)=>a.fiscalYear-b.fiscalYear||(a.fiscalQuarter??0)-(b.fiscalQuarter??0));
  const audit=estimateResearch(ordered,metric);
  const format=(v:number|null)=>metric==="eps"?v==null?"—":v.toFixed(2):financialNumber(v,currency);
  return <section className="py-4 space-y-3 border-b border-border"><h3 className="text-lg font-semibold">Estimate coverage & differences</h3><div className="flex flex-wrap gap-3"><label className="text-sm">Metric<select aria-label="Estimate audit metric" className="ml-2 bg-background border border-border rounded p-2" value={metric} onChange={e=>setMetric(e.target.value as typeof metric)}><option value="revenue">Revenue</option><option value="eps">EPS</option></select></label><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={reportedOnly} onChange={e=>setReportedOnly(e.target.checked)}/>Reported releases only</label></div><p className="text-sm">{audit.covered}/{audit.rows.length} records with nonzero estimates and actuals · Mean absolute difference: <strong>{financialPercent(audit.meanAbsoluteError)}</strong> · Signed bias: <strong>{financialPercent(audit.bias)}</strong>.</p><ResearchTable headers={["Period","Release date","Actual","Estimate","Difference %"]} rows={audit.rows.map(r=>[financialPeriod(r.event),r.event.reportedDate?.slice(0,10)??"Not reported",format(r.actual),format(r.estimate),financialPercent(r.error)])}/><p className="text-xs text-muted-foreground">Difference = (actual − estimate) / |estimate|. Zero/missing estimates are not scored. Positive signed bias means actuals exceeded the stored estimates. Estimate as-of dates and revisions are not supplied, so this is a descriptive audit—not a forecast-accuracy backtest. No analyst identities, counts, targets or confidence scores are fabricated.</p></section>;
}
