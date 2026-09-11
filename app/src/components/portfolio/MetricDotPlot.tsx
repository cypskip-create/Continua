import { useState } from "react";

interface DotPoint { symbol: string; value: number; weight?: number; good?: boolean }

interface MetricDotPlotProps {
  points: DotPoint[];
  portfolioValue?: number | null;
  marketValue?: number | null;
  marketLabel?: string;
  fmt: (v: number) => string;
  unavailableCount?: number;
}

/** A single-axis strip plot: each holding is a dot positioned by its
 *  value, sized by portfolio weight, colored green/red by the `good` flag
 *  the caller supplies (since "good" direction differs per metric — high
 *  ROE is good, high debt/equity is not). Portfolio and market values get
 *  their own reference line with a pill label, same convention across
 *  every Key Metrics & Benchmarks panel. */
export function MetricDotPlot({ points, portfolioValue, marketValue, marketLabel = "Market", fmt, unavailableCount }: MetricDotPlotProps) {
  // Which holding's dot is expanded into a small detail popup — tap a dot
  // to open it, tap it again (or anywhere else on the plot) to close it.
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);

  if (points.length === 0 && portfolioValue == null) {
    return <p className="text-[11px] text-muted-foreground py-8 text-center">No data on file for this metric yet.</p>;
  }

  const allValues = [...points.map((p) => p.value), ...(portfolioValue != null ? [portfolioValue] : []), ...(marketValue != null ? [marketValue] : [])];
  const min = Math.min(0, ...allValues);
  const max = Math.max(...allValues, min + 1);
  const pad = (max - min) * 0.12 || 1;
  const domainMin = min - pad;
  const domainMax = max + pad;
  const pctOf = (v: number) => Math.max(0, Math.min(100, ((v - domainMin) / (domainMax - domainMin)) * 100));

  const maxWeight = Math.max(1, ...points.map((p) => p.weight ?? 1));
  const ticks = 5;
  const tickVals = Array.from({ length: ticks }, (_, i) => domainMin + ((domainMax - domainMin) / (ticks - 1)) * i);

  return (
    <div>
      <div className="relative pt-8 pb-1">
        {portfolioValue != null && (
          <div className="absolute -top-1 flex flex-col items-center" style={{ left: `${pctOf(portfolioValue)}%`, transform: "translateX(-50%)" }}>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-400 text-blue-400 whitespace-nowrap mb-0.5">Portfolio {fmt(portfolioValue)}</span>
          </div>
        )}
      </div>

      <div className="relative h-40 rounded-xl bg-muted/20 mx-1" onClick={() => setOpenSymbol(null)}>
        {tickVals.map((t, i) => (
          <div key={i} className="absolute top-0 bottom-0 border-l border-border/30" style={{ left: `${(i / (ticks - 1)) * 100}%` }} />
        ))}

        {marketValue != null && (
          <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-muted-foreground/60" style={{ left: `${pctOf(marketValue)}%` }}>
            <span className="absolute -top-6 -translate-x-1/2 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border border-muted-foreground/60 text-muted-foreground whitespace-nowrap">{marketLabel} {fmt(marketValue)}</span>
          </div>
        )}
        {portfolioValue != null && (
          <div className="absolute top-0 bottom-0 border-l-2 border-blue-400" style={{ left: `${pctOf(portfolioValue)}%` }} />
        )}

        {points.map((p) => {
          const size = 22 + ((p.weight ?? 1) / maxWeight) * 24;
          const isOpen = openSymbol === p.symbol;
          return (
            <div
              key={p.symbol}
              className="absolute"
              style={{
                left: `${pctOf(p.value)}%`,
                top: "50%",
                width: size, height: size,
                transform: "translate(-50%, -50%)",
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpenSymbol(isOpen ? null : p.symbol); }}
                className={`w-full h-full rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow transition-transform ${isOpen ? "ring-2 ring-offset-1 ring-foreground scale-110" : ""} ${p.good === false ? "bg-bear" : p.good === true ? "bg-bull" : "bg-muted-foreground"}`}
                aria-label={`${p.symbol}: ${fmt(p.value)}`}
              >
                {size >= 30 ? p.symbol : ""}
              </button>

              {isOpen && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 whitespace-nowrap rounded-lg bg-foreground text-background shadow-lg px-2.5 py-1.5 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-bold leading-tight">{p.symbol}</p>
                  <p className="text-[11.5px] font-bold tabular leading-tight">{fmt(p.value)}</p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[9.5px] text-muted-foreground mt-1.5 px-1">
        {tickVals.map((t, i) => <span key={i}>{fmt(t)}</span>)}
      </div>

      {!!unavailableCount && (
        <p className="text-[10.5px] text-muted-foreground mt-3">
          {unavailableCount} holding{unavailableCount === 1 ? "" : "s"} do{unavailableCount === 1 ? "es" : ""} not have a value for this metric.
        </p>
      )}
    </div>
  );
}