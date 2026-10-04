import { useState, useMemo, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown } from "lucide-react";
import { usePortfolioHistory } from "@/hooks/usePortfolioHistory";

interface PerformancePoint {
  date: string;
  value: number; // real KES value at this point
  timestamp: number;
}

interface RobinhoodPerformanceChartProps {
  /** Current total portfolio value (real, from live prices). */
  totalValue: number;
  /** Total cost basis (real) — the anchor for the "ALL" timeframe, and the % denominator. */
  totalCost: number;
  /** Portfolio value as of yesterday's close (real, totalValue - todayGain) — the anchor for "1D". */
  dayStartValue: number;
  mode?: "value" | "performance";
  /** When true, mask absolute currency values (still show %). */
  hideValue?: boolean;
  /** Retained for API compatibility; charts never synthesize market data. */
  seed?: string;
  /** Current holdings (symbol + share count) — when provided, every
   *  timeframe except "1D" plots the portfolio's REAL historical value
   *  (real daily closes × today's share count). Without holdings, historical
   *  windows remain empty rather than fabricating a market path. */
  holdings?: { symbol: string; shares: number }[];
}

const timeframes = [
  { label: "1D", days: 1 },
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "YTD", days: Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (24 * 60 * 60 * 1000))) },
  { label: "1Y", days: 365 },
  { label: "ALL", days: 730 },
];

const haptic = (() => {
  let last = 0;
  return (ms = 8) => {
    const now = Date.now();
    if (now - last < 40) return;
    last = now;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(ms); } catch { /* Haptics are optional. */ }
    }
  };
})();

export function RobinhoodPerformanceChart({
  totalValue,
  totalCost,
  dayStartValue,
  mode = "value",
  hideValue = false,
  seed: _seed = "",
  holdings,
}: RobinhoodPerformanceChartProps) {
  const [activeTimeframe, setActiveTimeframe] = useState("1M");
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; fraction: number } | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const PLOT_MARGIN_TOP = 5;
  const PLOT_MARGIN_BOTTOM = 5;

  // Real closes for the selected window — "1D" is deliberately excluded
  // (see usePortfolioHistory's own note: no intraday candle source yet).
  const { points: realPoints, isLoading: realLoading, hasRealData } = usePortfolioHistory(
    holdings ?? [],
    activeTimeframe
  );
  const useRealData = activeTimeframe !== "1D" && !!holdings && hasRealData && !realLoading;

  const formatDateLabel = (date: Date, days: number): string => {
    if (days <= 1) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (days <= 7) return date.toLocaleDateString("en-US", { weekday: "short", hour: "numeric" });
    if (days <= 30) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  // Real daily closes × today's share count, formatted the same way the
  // generated series is, with one synthetic point appended for "right
  // now" (using the live totalValue) — real daily candles only go up to
  // the last close, so without this the line would visibly stop a day
  // short of the live total shown in the hero number above it.
  const realData = useMemo((): PerformancePoint[] => {
    if (!useRealData) return [];
    const windowDays = timeframes.find((t) => t.label === activeTimeframe)?.days ?? 30;
    const formatted: PerformancePoint[] = realPoints.map((p) => ({
      date: formatDateLabel(new Date(p.timestamp), windowDays),
      value: p.value,
      timestamp: p.timestamp,
    }));
    formatted.push({ date: "Now", value: totalValue, timestamp: Date.now() });
    return formatted;
  }, [useRealData, realPoints, activeTimeframe, totalValue]);

  const rawData = useMemo(
    () => useRealData
      ? realData
      : activeTimeframe === "1D"
        ? [
            { date: "Previous close", value: dayStartValue, timestamp: Date.now() - 86_400_000 },
            { date: "Now", value: totalValue, timestamp: Date.now() },
          ]
        : [],
    [useRealData, realData, activeTimeframe, totalValue, dayStartValue]
  );

  // In "performance" mode every point is shown as % vs cost basis, so the chart's
  // shape reflects genuine cumulative return at each point in the chosen window,
  // rather than a value disconnected from what's actually being plotted.
  const chartData = useMemo(() => {
    if (mode !== "performance" || totalCost <= 0) return rawData;
    return rawData.map(p => ({ ...p, value: ((p.value - totalCost) / totalCost) * 100 }));
  }, [rawData, mode, totalCost]);

  // Mirrors the YAxis's auto ['dataMin', 'dataMax'] domain exactly, so our manual
  // y-pixel calc for the crosshair dot lines up with where recharts actually draws the curve.
  const { valMin, valMax } = useMemo(() => {
    const values = chartData.length ? chartData.map(p => p.value) : [0];
    return { valMin: Math.min(...values), valMax: Math.max(...values) };
  }, [chartData]);

  const startOfWindow = chartData[0]?.value ?? 0;
  const endOfWindow = chartData[chartData.length - 1]?.value ?? 0;
  const displayValue = hoverValue ?? (chartData.length ? endOfWindow : (mode === "performance" && totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : totalValue));
  const changeInWindow = displayValue - startOfWindow;
  const changePercent = mode === "performance"
    ? changeInWindow
    : (startOfWindow !== 0 ? (changeInWindow / Math.abs(startOfWindow)) * 100 : 0);
  // The up/down color and arrow always reflect the change *within the
  // selected window* (today's move for 1D, this month's for 1M, etc.) —
  // never the all-time cumulative return. changeInWindow's sign is the same
  // in both modes regardless of unit (KES vs % of cost basis), since it's
  // ultimately derived from the same underlying raw values — so this one
  // line is what keeps the Value and Performance tabs from disagreeing with
  // each other on the same timeframe.
  const isPositive = changeInWindow >= 0;

  const gradientId = `perfGrad-${activeTimeframe}-${mode}`;
  const lineColor = isPositive ? 'hsl(var(--bull))' : 'hsl(var(--bear))';
  const greyLineColor = "hsl(var(--muted-foreground))";
  const crosshairGradId = `perfChGrad-${activeTimeframe}-${mode}`;
  const crosshairFraction = crosshair ? crosshair.fraction : 1;

  // As with the stock chart, activeCoordinate.y from recharts isn't reliably snapped to
  // the plotted value's pixel position, so we derive the dot's y ourselves from the real
  // value + measured plot area + the same min/max the YAxis uses — keeping the dot exactly on the line.
  const handleMove = useCallback((state: { activeIndex?: number | string; activeCoordinate?: { x: number; y?: number } } | null) => {
    const idx = state?.activeIndex != null ? Number(state.activeIndex) : NaN;
    const coord = state?.activeCoordinate;
    if (Number.isFinite(idx) && chartData[idx] && coord) {
      const point = chartData[idx];
      const rect = plotRef.current?.getBoundingClientRect();
      const plotHeight = rect ? Math.max(1, rect.height - PLOT_MARGIN_TOP - PLOT_MARGIN_BOTTOM) : 0;
      const priceY = valMax === valMin
        ? PLOT_MARGIN_TOP + plotHeight / 2
        : PLOT_MARGIN_TOP + (1 - (point.value - valMin) / (valMax - valMin)) * plotHeight;
      const plotWidth = rect?.width || 1;
      setCrosshair({ x: coord.x, y: priceY, fraction: Math.min(1, Math.max(0, coord.x / plotWidth)) });
      setHoverValue(prev => {
        if (prev !== point.value) haptic(6);
        return point.value;
      });
      setHoverDate(point.date);
    }
  }, [chartData, valMin, valMax]);

  const handleLeave = useCallback(() => {
    setHoverValue(null);
    setHoverDate(null);
    setCrosshair(null);
  }, []);

  const formatHero = (v: number) => {
    if (mode === "performance") return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    if (hideValue) return '••••••';
    return `KES ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="overflow-hidden px-4">
        {/* Hero */}
        <div className="mb-3">
          <div className="text-xl font-bold tracking-tight tabular-nums">
            {formatHero(displayValue)}
          </div>
          <div className={`flex items-center gap-1 mt-0.5 text-[11px] ${isPositive ? 'text-bull' : 'text-bear'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {mode === "value" ? (
              <>
                {!hideValue && (
                  <span className="font-semibold">
                    {changeInWindow >= 0 ? '+' : ''}KES {Math.abs(changeInWindow).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                )}
                <span className={hideValue ? 'font-semibold' : 'opacity-80'}>
                  {hideValue ? '' : '('}{changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%{hideValue ? '' : ')'}
                </span>
              </>
            ) : (
              <span className="font-semibold">
                {changeInWindow >= 0 ? '+' : ''}{changeInWindow.toFixed(1)}% in {activeTimeframe}
              </span>
            )}
            <span className="text-muted-foreground ml-1">{hoverDate || activeTimeframe}</span>
          </div>
        </div>

        {/* Chart */}
        <div
          ref={plotRef}
          className="relative h-[170px] -mx-4 touch-none select-none"
          onTouchStart={() => haptic(10)}
          onTouchEnd={handleLeave}
        >
          {chartData.length >= 2 ? <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              onMouseMove={handleMove}
              onMouseLeave={handleLeave}
              onTouchMove={handleMove}
              margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="50%" stopColor={lineColor} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={crosshairGradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset={0} stopColor={lineColor} />
                  <stop offset={crosshairFraction} stopColor={lineColor} />
                  <stop offset={crosshairFraction} stopColor={greyLineColor} />
                  <stop offset={1} stopColor={greyLineColor} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip content={() => null} cursor={false} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={`url(#${crosshairGradId})`}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer> : <div className="flex h-full items-center justify-center px-8 text-center text-xs text-muted-foreground">Verified historical portfolio prices are still being collected for this period.</div>}
          {crosshair && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute w-px bg-foreground/30" style={{ left: crosshair.x, top: 0, bottom: 0 }} />
              <div
                className="absolute h-2.5 w-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-background"
                style={{ left: crosshair.x, top: crosshair.y, backgroundColor: lineColor }}
              />
            </div>
          )}
        </div>

        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          {activeTimeframe === "1D"
            ? "Previous close to latest quote only; not an intraday price path."
            : "Historical closes at today's share counts. Excludes past trades, cash flows and dividends; not your account's historical return."}
        </p>
        {/* Timeframe */}
        <div className="flex justify-between mt-3 border-t border-border pt-3">
          {timeframes.map((tf) => (
            <Button
              key={tf.label}
              variant="ghost"
              size="sm"
              onClick={() => { setActiveTimeframe(tf.label); haptic(5); }}
              className={`text-[11px] px-2.5 py-1 h-auto font-semibold rounded-full border transition-all ${
                activeTimeframe === tf.label ? 'text-foreground border-foreground' : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {tf.label}
            </Button>
          ))}
        </div>
    </div>
  );
}
