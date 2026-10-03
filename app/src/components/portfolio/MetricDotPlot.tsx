import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface DotPoint { symbol: string; name?: string; value: number; weight?: number; good?: boolean }

interface MetricDotPlotProps {
  points: DotPoint[];
  portfolioValue?: number | null;
  marketValue?: number | null;
  marketLabel?: string;
  fmt: (v: number) => string;
  unavailableCount?: number;
}

/** Collision-free comparison lanes inspired by visual portfolio analysis:
 * every holding gets an independently tappable row on a shared scale, while
 * portfolio and market references remain visible across every row. */
export function MetricDotPlot({ points, portfolioValue, marketValue, marketLabel = "Market", fmt, unavailableCount }: MetricDotPlotProps) {
  const navigate = useNavigate();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(points[0]?.symbol ?? null);
  const selected = points.find((point) => point.symbol === selectedSymbol) ?? points[0];
  const { domainMin, domainMax, ticks } = useMemo(() => {
    const values = [...points.map((point) => point.value), ...(portfolioValue != null ? [portfolioValue] : []), ...(marketValue != null ? [marketValue] : [])];
    const min = Math.min(0, ...values);
    const max = Math.max(...values, min + 1);
    const pad = (max - min) * 0.1 || 1;
    const low = min - pad;
    const high = max + pad;
    return { domainMin: low, domainMax: high, ticks: Array.from({ length: 4 }, (_, index) => low + ((high - low) / 3) * index) };
  }, [points, portfolioValue, marketValue]);
  const pctOf = (value: number) => Math.max(2, Math.min(98, ((value - domainMin) / (domainMax - domainMin)) * 100));

  if (points.length === 0 && portfolioValue == null) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">No verified data on file for this metric yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
        {portfolioValue != null && <span className="rounded-full bg-blue-500/10 px-2 py-1 text-blue-500">Portfolio {fmt(portfolioValue)}</span>}
        {marketValue != null && <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{marketLabel} {fmt(marketValue)}</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/10">
        {points.map((point) => {
          const isSelected = point.symbol === selected?.symbol;
          return (
            <button key={point.symbol} type="button" onClick={() => setSelectedSymbol(point.symbol)} className={`grid w-full grid-cols-[4.25rem_1fr] items-center border-b border-border/40 px-2 py-2.5 text-left last:border-b-0 ${isSelected ? "bg-primary/8" : "hover:bg-muted/30"}`}>
              <span className={`truncate text-[11px] font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>{point.symbol}</span>
              <span className="relative block h-5">
                {ticks.map((_, index) => <span key={index} className="absolute inset-y-0 border-l border-border/30" style={{ left: `${index * (100 / 3)}%` }} />)}
                {marketValue != null && <span className="absolute inset-y-0 border-l border-dashed border-muted-foreground/70" style={{ left: `${pctOf(marketValue)}%` }} />}
                {portfolioValue != null && <span className="absolute inset-y-0 border-l-2 border-blue-500/70" style={{ left: `${pctOf(portfolioValue)}%` }} />}
                <span className={`absolute top-1/2 grid h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full px-1 text-[8px] font-bold text-white shadow-sm ${point.good === false ? "bg-bear" : point.good === true ? "bg-bull" : "bg-muted-foreground"} ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`} style={{ left: `${pctOf(point.value)}%` }}>{fmt(point.value)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between px-[4.75rem] text-[9px] tabular-nums text-muted-foreground">{ticks.map((tick, index) => <span key={index}>{fmt(tick)}</span>)}</div>

      {selected && (
        <button type="button" onClick={() => navigate(`/stock/${selected.symbol}`)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3 text-left">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{selected.symbol.slice(0, 3)}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{selected.name || selected.symbol}</p><p className="text-[11px] text-muted-foreground">{fmt(selected.value)} · {(selected.weight ?? 0).toFixed(1)}% portfolio weight</p></div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {!!unavailableCount && <p className="text-[10.5px] text-muted-foreground">{unavailableCount} holding{unavailableCount === 1 ? "" : "s"} lack verified data for this metric.</p>}
    </div>
  );
}
