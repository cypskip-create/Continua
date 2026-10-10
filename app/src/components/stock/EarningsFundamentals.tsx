import { useQuery } from "@tanstack/react-query";
import { corporateActionsApi } from "@/api/corporateActionsApi";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EarningsDetailButton, EarningsMovePreview, EarningsOverview } from "./EarningsDetail";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { financialNumber } from "@/lib/financialPresentation";
import { ForecastDetail } from "./ForecastDetail";

function compact(value: number, currency: string) {
  return financialNumber(value,currency);
}

export function EarningsFundamentals({ symbol, currency, mode = "all" }: { symbol: string; currency: string; mode?: "reported" | "analysis" | "forecast" | "all" }) {
  const [metric, setMetric] = useState<"revenue" | "eps" | "netIncome" | "ebit">("revenue");
  const {history} = useStockFinancials(symbol,{periodType:"annual",limit:10});
  const { data: earnings = [] } = useQuery({
    queryKey: ["continua", "earnings", symbol],
    queryFn: () => corporateActionsApi.getEarningsForSymbol(symbol),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const ordered = [...earnings].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0));
  const latest = [...ordered].reverse().find(event => event.reportedDate);
  const estimated = earnings.filter(event => event.revenueEstimate != null || event.epsEstimate != null);
  const points = ordered.slice(-8).map(event => ({
    period: `${event.fiscalYear}/${event.fiscalQuarter ? `Q${event.fiscalQuarter}` : "FY"}`,
    actual: metric === "revenue" ? event.revenueActual : metric === "eps" ? event.epsActual : metric === "netIncome" ? history.find(r=>r.fiscalYear===event.fiscalYear && (r.fiscalQuarter??null)===(event.fiscalQuarter??null))?.netIncome ?? null : null,
    estimate: metric === "revenue" ? event.revenueEstimate : metric === "eps" ? event.epsEstimate : null,
  }));
  const format = (value: number) => metric === "eps" ? Number(value).toFixed(2) : financialNumber(value,currency);
  return <>
    {mode !== "analysis" && mode !== "forecast" && <section className="border-t border-border/70 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-semibold">Latest earnings</h3><EarningsDetailButton symbol={symbol} currency={currency} events={earnings}/></div>
      {latest ? <>
        <EarningsOverview event={latest} history={history} currency={currency}/>
      </> : <p className="text-sm text-muted-foreground">No reported earnings event is on file yet.</p>}
    </section>}
    {mode !== "reported" && <><section className="border-t border-border/70 py-6">
      <h3 className="text-lg font-semibold">Financial estimates</h3>
      <div role="tablist" aria-label="Estimates metric" className="flex gap-1 py-2 overflow-x-auto">{(["revenue", "netIncome", "eps", "ebit"] as const).map(value => <button key={value} role="tab" aria-selected={metric === value} onClick={() => setMetric(value)} className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full ${metric === value ? "contrast-active" : "text-muted-foreground"}`}>{value === "revenue" ? "Revenue" : value === "eps" ? "EPS" : value === "ebit" ? "EBIT" : "Net income"}</button>)}</div>
      {(metric === "netIncome" || metric === "ebit") && <p className="text-sm text-muted-foreground">No sourced {metric === "ebit" ? "EBIT" : "net income"} estimate feed is available. Reported values are in Financial detail.</p>}
      {points.some(point => point.actual != null || point.estimate != null) && <><div className="h-52" role="img" aria-label={`${metric} actual and estimate history`}><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" /><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: "0.625rem" }} /><YAxis hide domain={["auto", "auto"]} /><Tooltip formatter={(value: number) => format(value)} contentStyle={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))" }} /><Line dataKey="actual" name="Actual" stroke="#4f7cf5" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} /><Line dataKey="estimate" name="Estimate" stroke="#f97316" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div><p className="text-center text-xs text-muted-foreground"><span className="text-blue-500">●</span> Actual · <span className="text-orange-500">●</span> Sourced estimate</p></>}
      {estimated.length ? <div className="mt-4 divide-y divide-border/60">{estimated.slice(-5).map(event => <div key={event.id} className="grid grid-cols-3 gap-2 py-3 text-sm"><span>{event.fiscalQuarter ? `Q${event.fiscalQuarter}` : "FY"} {event.fiscalYear}</span><span className="text-right">{event.revenueEstimate == null ? "—" : compact(Number(event.revenueEstimate), currency)}<span className="block text-xs text-muted-foreground">Revenue est.</span></span><span className="text-right">{event.epsEstimate == null ? "—" : Number(event.epsEstimate).toFixed(2)}<span className="block text-xs text-muted-foreground">EPS est.</span></span></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No verified analyst estimates are on file for this stock.</p>}
    </section>
    {mode !== "forecast" && <EarningsMovePreview symbol={symbol} currency={currency} events={earnings}/>}
    <ForecastDetail symbol={symbol} currency={currency} events={earnings}/>
    </>}
  </>;
}
