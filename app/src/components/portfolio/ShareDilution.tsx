import { useQueries } from "@tanstack/react-query";
import { financialsApi } from "@/api/financialsApi";
import { InfoTip } from "./InfoTip";

interface HoldingLike { symbol: string; weight: number }

interface ShareDilutionProps {
  holdings: HoldingLike[];
}

/** Continua doesn't ingest a direct shares-outstanding history field, but
 *  reported net income and EPS together imply it (shares ≈ netIncome / eps)
 *  for any period where EPS is non-zero. Comparing that implied share
 *  count across the two most recent annual periods gives a real, if
 *  derived, dilution figure — documented as such rather than presented as
 *  a directly-disclosed number. */
export function ShareDilution({ holdings }: ShareDilutionProps) {
  const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["continua", "financials-history", symbol, "dilution"],
      queryFn: () => financialsApi.getHistory(symbol, { periodType: "annual", limit: 2 }),
      staleTime: 60 * 60_000,
      retry: 1,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);

  const rows = symbols.map((symbol, i) => {
    const history = results[i]?.data ?? [];
    const [latest, prior] = history; // newest first, per API convention used elsewhere
    if (!latest?.eps || !prior?.eps || latest.eps === 0 || prior.eps === 0) {
      return { symbol, dilutionPct: null as number | null };
    }
    const latestShares = latest.netIncome / latest.eps;
    const priorShares = prior.netIncome / prior.eps;
    if (priorShares === 0) return { symbol, dilutionPct: null };
    return { symbol, dilutionPct: ((latestShares - priorShares) / Math.abs(priorShares)) * 100 };
  });

  const withData = rows.filter((r) => r.dilutionPct != null) as { symbol: string; dilutionPct: number }[];
  const weights = Object.fromEntries(holdings.map((h) => [h.symbol.toUpperCase(), h.weight]));
  const coveredWeight = withData.reduce((s, r) => s + (weights[r.symbol] ?? 0), 0);
  const portfolioDilution = coveredWeight > 0
    ? withData.reduce((s, r) => s + r.dilutionPct * (weights[r.symbol] ?? 0), 0) / coveredWeight
    : null;

  const maxAbs = Math.max(0.5, ...withData.map((r) => Math.abs(r.dilutionPct)));

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <h3 className="font-serif text-lg">Share Dilution</h3>
        <InfoTip>
          Shares outstanding aren't directly disclosed in Continua's data feed, so this is implied
          from reported net income ÷ EPS across the two most recent annual periods — a derived
          figure, not a direct company disclosure.
        </InfoTip>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground mb-4">How much each holding's implied share count grew or shrank year over year.</p>

      {isLoading ? (
        <p className="text-[0.6875rem] text-muted-foreground py-6 text-center">Loading financial history…</p>
      ) : withData.length === 0 ? (
        <p className="text-[0.6875rem] text-muted-foreground py-6 text-center">
          No holdings have two full annual periods with usable EPS data on file yet.
        </p>
      ) : (
        <>
          {portfolioDilution != null && (
            <div className="flat-section rounded-xl bg-muted/30 p-3 mb-3 flex items-center justify-between">
              <span className="text-[0.75rem] font-bold">Portfolio (weighted)</span>
              <span className={`text-[0.8125rem] font-bold tabular ${portfolioDilution <= 0.5 ? "text-bull" : "text-bear"}`}>
                {portfolioDilution >= 0 ? "+" : ""}{portfolioDilution.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="space-y-2">
            {withData.sort((a, b) => b.dilutionPct - a.dilutionPct).map((r) => {
              const widthPct = Math.max(3, (Math.abs(r.dilutionPct) / maxAbs) * 100);
              const positive = r.dilutionPct <= 0.5; // flat-to-shrinking share count is favorable
              return (
                <div key={r.symbol} className="flex items-center gap-3">
                  <span className="text-[0.6875rem] font-bold w-14 shrink-0">{r.symbol}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${positive ? "bg-bull" : "bg-bear"}`} style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="text-[0.6875rem] font-semibold tabular w-16 text-right">{r.dilutionPct >= 0 ? "+" : ""}{r.dilutionPct.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
          {rows.length > withData.length && (
            <p className="text-[0.625rem] text-muted-foreground mt-3">
              {rows.length - withData.length} holding{rows.length - withData.length === 1 ? "" : "s"} don't have a value for this metric.
            </p>
          )}
        </>
      )}
    </div>
  );
}
