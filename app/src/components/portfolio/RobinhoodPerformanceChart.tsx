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
  /** Optional seed so the simulated curve stays stable per portfolio. */
  seed?: string;
  /** Current holdings (symbol + share count) — when provided, every
   *  timeframe except "1D" plots the portfolio's REAL historical value
   *  (real daily closes × today's share count) instead of a generated
   *  shape. Omit to keep the old fully-generated behavior (e.g. for a
   *  context with no real holdings to look up, like a demo/preview). */
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
      try { navigator.vibrate(ms); } catch {}
    }
  };
})();

export function RobinhoodPerformanceChart({
  totalValue,
  totalCost,
  dayStartValue,
  mode = "value",
  hideValue = false,
  seed = "",
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

  const rng = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  };

  // The real anchor for a given window length: 1 day out uses the REAL value as of
  // yesterday's close (dayStartValue); the full "ALL" window (730d) uses the REAL cost
  // basis. Everything in between is a smooth blend of those two real numbers — so every
  // timeframe starts from a value that's actually grounded, not just a re-labeled
  // re-sample of the same start→end line.
  const anchorForWindow = (days: number) => {
    if (days <= 1) return dayStartValue;
    const t = Math.min(1, Math.pow(days / 730, 0.55));
    return dayStartValue + (totalCost - dayStartValue) * t;
  };

  const formatDateLabel = (date: Date, days: number): string => {
    if (days <= 1) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (days <= 7) return date.toLocaleDateString("en-US", { weekday: "short", hour: "numeric" });
    if (days <= 30) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const generateData = (days: number): PerformancePoint[] => {
    const data: PerformancePoint[] = [];
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const startValue = anchorForWindow(days);
    const endValue = totalValue;
    const volatility = 0.012;
    const rand = rng(`${seed}|${activeTimeframe}|${startValue.toFixed(2)}|${endValue.toFixed(2)}`);

    const points = days <= 1 ? 78
                 : days <= 7 ? days * 4
                 : days <= 30 ? days
                 : days <= 90 ? Math.ceil(days / 2)
                 : Math.ceil(days / 7);

    let prevValue = startValue;
    for (let i = 0; i < points; i++) {
      const progress = i / Math.max(1, points - 1);
      const baseValue = startValue + (endValue - startValue) * progress;
      const randomWalk = (rand() - 0.5) * volatility * Math.max(Math.abs(baseValue), 1);
      const smoothing = 0.7;
      const value = i === 0 ? startValue : prevValue * smoothing + (baseValue + randomWalk) * (1 - smoothing);
      prevValue = value;

      const timestamp = now - (points - 1 - i) * (days * msPerDay / points);
      const date = new Date(timestamp);
      data.push({ date: formatDateLabel(date, days), value, timestamp });
    }
    // Force both endpoints to the exact real anchors — no drift from the numbers shown elsewhere on the page.
    if (data.length > 0) { data[0].value = startValue; data[data.length - 1].value = endValue; }
    return data;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRealData, realPoints, activeTimeframe, totalValue]);

  const selectedTimeframe = timeframes.find(t => t.label === activeTimeframe)!;
  const rawData = useMemo(
    () => (useRealData ? realData : generateData(selectedTimeframe.days)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useRealData, realData, activeTimeframe, totalValue, totalCost, dayStartValue, seed]
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
    const values = chartData.map(p => p.value);
    return { valMin: Math.min(...values), valMax: Math.max(...values) };
  }, [chartData]);

  const startOfWindow = chartData[0]?.value ?? 0;
  const endOfWindow = chartData[chartData.length - 1]?.value ?? 0;
  const displayValue = hoverValue ?? endOfWindow;
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
  const handleMove = useCallback((state: any) => {
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
          <ResponsiveContainer width="100%" height="100%">
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
          </ResponsiveContainer>
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