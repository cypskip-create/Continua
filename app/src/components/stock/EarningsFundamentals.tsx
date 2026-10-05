import { useQuery } from "@tanstack/react-query";
import { corporateActionsApi } from "@/api/corporateActionsApi";

function compact(value: number, currency: string) {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value) >= 1e9 ? 1e9 : Math.abs(value) >= 1e6 ? 1e6 : 1;
  return `${currency} ${(value / magnitude).toFixed(2)}${magnitude === 1e9 ? "B" : magnitude === 1e6 ? "M" : ""}`;
}

export function EarningsFundamentals({ symbol, currency }: { symbol: string; currency: string }) {
  const { data: earnings = [] } = useQuery({
    queryKey: ["continua", "earnings", symbol],
    queryFn: () => corporateActionsApi.getEarningsForSymbol(symbol),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const latest = [...earnings].reverse().find(event => event.reportedDate);
  const estimated = earnings.filter(event => event.revenueEstimate != null || event.epsEstimate != null);
  return <>
    <section className="border-t border-border/70 py-6 space-y-4">
      <h3 className="text-lg font-semibold">Latest earnings</h3>
      {latest ? <>
        <p className="text-xs text-muted-foreground">{latest.fiscalQuarter ? `Q${latest.fiscalQuarter}` : "FY"} {latest.fiscalYear} · Reported {new Date(latest.reportedDate!).toLocaleDateString()}</p>
        <div className="grid grid-cols-3 gap-2 border-b border-border/70 pb-2 text-xs text-muted-foreground"><span>Metric</span><span className="text-right">Estimate</span><span className="text-right">Actual</span></div>
        <div className="grid grid-cols-3 gap-2 text-sm"><span>Revenue</span><span className="text-right">{latest.revenueEstimate == null ? "—" : compact(Number(latest.revenueEstimate), currency)}</span><span className="text-right font-semibold">{latest.revenueActual == null ? "—" : compact(Number(latest.revenueActual), currency)}</span></div>
        <div className="grid grid-cols-3 gap-2 text-sm"><span>EPS</span><span className="text-right">{latest.epsEstimate == null ? "—" : Number(latest.epsEstimate).toFixed(2)}</span><span className="text-right font-semibold">{latest.epsActual == null ? "—" : Number(latest.epsActual).toFixed(2)}</span></div>
      </> : <p className="text-sm text-muted-foreground">No reported earnings event is on file yet.</p>}
    </section>
    <section className="border-t border-border/70 py-6">
      <h3 className="text-lg font-semibold">Financial estimates</h3>
      {estimated.length ? <div className="mt-4 divide-y divide-border/60">{estimated.slice(-5).map(event => <div key={event.id} className="grid grid-cols-3 gap-2 py-3 text-sm"><span>{event.fiscalQuarter ? `Q${event.fiscalQuarter}` : "FY"} {event.fiscalYear}</span><span className="text-right">{event.revenueEstimate == null ? "—" : compact(Number(event.revenueEstimate), currency)}<span className="block text-xs text-muted-foreground">Revenue est.</span></span><span className="text-right">{event.epsEstimate == null ? "—" : Number(event.epsEstimate).toFixed(2)}<span className="block text-xs text-muted-foreground">EPS est.</span></span></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No verified analyst estimates are on file for this stock.</p>}
    </section>
  </>;
}
