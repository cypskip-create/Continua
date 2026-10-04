import { useEffect, useMemo, useRef, useState } from "react";
import { layoutMetricBubbles } from "@/lib/metricLayout";
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

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Shared-scale holding bubble plot. Bubble area represents portfolio weight;
 * horizontal position represents the selected metric. Vertical lanes only
 * prevent collisions and carry no analytical meaning. */
export function MetricDotPlot({ points, portfolioValue, marketValue, marketLabel = "Market", fmt, unavailableCount }: MetricDotPlotProps) {
  const navigate = useNavigate();
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  const hasPlot = points.length > 0 || portfolioValue != null;
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPlot]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const values = points.map((point) => point.value);
  const middle = median(values);
  const mad = median(values.map((value) => Math.abs(value - middle)));
  const outliers = useMemo(() => new Set(points.filter((point) => {
    if (points.length < 4) return false;
    const robustLimit = Math.max(mad * 6, Math.abs(middle) * 4, 1);
    return Math.abs(point.value - middle) > robustLimit;
  }).map((point) => point.symbol)), [points, mad, middle]);
  const [hideOutliers, setHideOutliers] = useState(true);
  const visiblePoints = hideOutliers ? points.filter((point) => !outliers.has(point.symbol)) : points;
  const selected = points.find((point) => point.symbol === selectedSymbol);

  const refs = [portfolioValue, marketValue].filter((value): value is number => value != null && Number.isFinite(value));
  const domainValues = [...visiblePoints.map((point) => point.value), ...refs];
  const rawMin = Math.min(0, ...domainValues);
  const rawMax = Math.max(...domainValues, rawMin + 1);
  const pad = (rawMax - rawMin) * 0.08 || 1;
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;
  const pctOf = (value: number) => Math.max(1.5, Math.min(98.5, ((value - domainMin) / (domainMax - domainMin)) * 100));
  const ticks = Array.from({ length: 5 }, (_, index) => domainMin + ((domainMax - domainMin) / 4) * index);
  const maxWeight = Math.max(1, ...visiblePoints.map((point) => point.weight ?? 1));
  const directionSample = visiblePoints.find((point) => point.good != null && portfolioValue != null && point.value !== portfolioValue);
  const higherIsBetter = directionSample ? directionSample.good === (directionSample.value > (portfolioValue ?? 0)) : true;

  const pixelX = (value: number) => 38 + pctOf(value) / 100 * Math.max(1, width - 76);
  const positioned = layoutMetricBubbles(visiblePoints.map((point) => ({
    ...point, x: pixelX(point.value), size: 38 + Math.sqrt(Math.max(0, point.weight ?? 1) / maxWeight) * 30,
  })));
  const plotHeight = Math.max(310, (Math.max(0, ...positioned.map((point) => point.lane)) + 1) * 80 + 30);

  if (points.length === 0 && portfolioValue == null) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No verified data is available for this metric yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {portfolioValue != null && <span className="rounded-full border border-sky-500/70 px-3 py-1 text-xs font-bold text-sky-500">Portfolio {fmt(portfolioValue)}</span>}
        {marketValue != null && <span className="rounded-full border border-muted-foreground/70 px-3 py-1 text-xs font-bold text-foreground">{marketLabel} {fmt(marketValue)}</span>}
        {outliers.size > 0 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <button type="button" role="switch" aria-checked={hideOutliers} onClick={() => setHideOutliers((value) => !value)} className={`relative h-5 w-9 rounded-full transition-colors ${hideOutliers ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${hideOutliers ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </button>
            Hide {outliers.size} outlier{outliers.size === 1 ? "" : "s"}
          </label>
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
        <div ref={plotRef} className="relative overflow-hidden rounded-lg" style={{ height: plotHeight, background: higherIsBetter ? "linear-gradient(90deg, hsl(var(--bear)/.10), hsl(var(--bull)/.10))" : "linear-gradient(90deg, hsl(var(--bull)/.10), hsl(var(--bear)/.10))" }}>
          {ticks.map((tick, index) => <span key={index} className="absolute inset-y-0 border-l border-border/50" style={{ left: pixelX(tick) }} />)}
          {marketValue != null && <span className="absolute inset-y-0 z-[1] border-l-2 border-dashed border-foreground/65" style={{ left: pixelX(marketValue) }} />}
          {portfolioValue != null && <span className="absolute inset-y-0 z-[1] border-l-[3px] border-sky-500" style={{ left: pixelX(portfolioValue) }} />}

          {positioned.map((point) => {
            const size = point.size;
            return (
              <button
                key={point.symbol}
                type="button"
                aria-label={`${point.symbol}: ${fmt(point.value)}`}
                onClick={() => setSelectedSymbol(point.symbol)}
                className={`absolute z-[2] grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-background text-[10px] font-bold text-white shadow-md transition-transform active:scale-95 ${point.good === false ? "bg-bear" : point.good === true ? "bg-bull" : "bg-muted-foreground"} ${selectedSymbol === point.symbol ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                style={{ left: point.x, top: 55 + point.lane * 80, width: size, height: size }}
              >
                {point.symbol}
              </button>
            );
          })}
        </div>
        <div className="relative mt-2 h-5 text-[10px] tabular-nums text-muted-foreground">{ticks.map((tick, index) => <span className="absolute -translate-x-1/2" style={{ left: pixelX(tick) }} key={index}>{fmt(tick)}</span>)}</div>
      </div>

      {outliers.size > 0 && hideOutliers && <p className="text-[11px] text-muted-foreground">Hiding {[...outliers].join(", ")}, which sit far outside the range of the other holdings. Portfolio and market reference lines still use the complete dataset.</p>}
      {!!unavailableCount && <p className="text-[11px] text-muted-foreground">{unavailableCount} holding{unavailableCount === 1 ? "" : "s"} do{unavailableCount === 1 ? "es" : ""} not have a verified value for this metric.</p>}

      {selected && (
        <button type="button" onClick={() => navigate(`/stock/${selected.symbol}`)} className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-left">
          <div className={`grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-white ${selected.good === false ? "bg-bear" : selected.good === true ? "bg-bull" : "bg-muted-foreground"}`}>{selected.symbol.slice(0, 3)}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{selected.name || selected.symbol}</p><p className="text-[11px] text-muted-foreground">{fmt(selected.value)} · {(selected.weight ?? 0).toFixed(1)}% portfolio weight</p></div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
