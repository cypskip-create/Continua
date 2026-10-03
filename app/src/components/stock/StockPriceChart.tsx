import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell, CartesianGrid
} from "recharts";
import { useMemo, useCallback, useState, useRef, useEffect, useId } from "react";
import { sma, ema, bollingerBands, rsi, macd, parabolicSAR, kdj, williamsR, cci, DEFAULT_INDICATOR_SETTINGS, type IndicatorSettings } from "@/lib/technicalIndicators";
import { DRAW_TOOL_LOOKUP, type DrawToolId, type DrawPoint, type Drawing } from "@/lib/drawingTools";
import type { ChartPoint } from "@/hooks/useHistoricalCandles";

let lastHaptic = 0;
const chartHaptic = () => {
  const now = Date.now();
  if (now - lastHaptic < 45) return;
  lastHaptic = now;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(5);
};

export type ChartType = "line" | "area" | "candle";

interface StockPriceChartProps {
  symbol?: string;
  timeframe: string;
  chartType?: ChartType;
  // changePercent/isUp are computed relative to the start of the SELECTED timeframe
  // (i.e. the first point on screen), not relative to some fixed "today" price. This
  // lets the caller show gain/loss for whichever period the user is scrubbing through.
  onHoverPrice?: (price: number | null, date: string | null, changePercent?: number | null, isUp?: boolean | null) => void;
  /** Verified Continua Data Layer candle/quote data, pre-shaped for the chart. */
  data?: ChartPoint[];
  /** Which overlay/sub-panel indicators are switched on (Moomoo-style). Defaults to
   *  everything off — a clean chart until the person turns something on. */
  indicators?: IndicatorSettings;
  /** Fixed height (px) for the main price/candle pane. When set, turning on
   *  Volume/MACD/RSI/etc. never shrinks the main chart -- those panels get
   *  their own fixed height and are appended below, growing the component's
   *  total height instead (Moomoo-style). When omitted, the main pane fills
   *  whatever space its flex parent gives it (used by the fullscreen chart,
   *  which is already viewport-bounded). */
  mainHeight?: number;
  /** Show a real price scale on the right (ticked labels + a highlighted
   *  current-price tag), and let the person drag that scale up/down to
   *  zoom the price axis in/out — TradingView/Moomoo style. Off by default
   *  since the embedded card chart keeps a clean, label-free look. */
  showPriceAxis?: boolean;
  /** Draw faint horizontal gridlines behind the price chart. */
  showGrid?: boolean;
  /** When true, the crosshair stays put after a tap/click instead of
   *  clearing on mouse-leave / touch-end (used by the fullscreen chart's
   *  crosshair tool toggle). */
  pinCrosshair?: boolean;
  /** Enables the drawing-tools engine: pass the currently selected tool id
   *  (from the Drawing Tools sheet) and the person taps the required number
   *  of points on the main price pane to place it. Every drawing is anchored
   *  to real price values and relative time position (not raw pixels), so it
   *  stays put correctly if the price axis is zoomed or the pane is resized.
   *  Drawings persist across tool switches, and reset when the
   *  timeframe/symbol changes (an annotation from a different window/price
   *  range no longer means anything). Pass null/undefined when no tool is
   *  selected -- the draw overlay then lets pointer events pass through. */
  activeDrawTool?: DrawToolId | null;
  /** Fires the moment a drawing finishes (its last required point is
   *  placed), so the caller can e.g. deselect the tool in its toolbar. */
  onDrawToolComplete?: () => void;
  /** When true, keeps every placed drawing in memory but skips rendering
   *  them (the "Hide All" toolbar action) — distinct from clearing them. */
  hideDrawings?: boolean;
  /** Bump this (e.g. a counter) to clear every drawing. */
  clearDrawSignal?: number;
  /** Fires whenever the drawing count goes from zero to non-zero or back, so
   *  a caller can show/hide a "clear drawings" affordance. */
  onDrawingsChange?: (hasDrawings: boolean) => void;
}

// Fixed panel heights (px) for Volume and the oscillator sub-panel. These are
// constants, not proportions of the total -- that's the whole point: adding
// a panel adds exactly this many pixels below, and never eats into the main
// chart's own height.
const VOLUME_PANEL_HEIGHT = 56;
const SUB_PANEL_HEIGHT = 84;

export const StockPriceChart = ({ symbol = "STK", timeframe, chartType = "area", onHoverPrice, data: liveData, indicators = DEFAULT_INDICATOR_SETTINGS, mainHeight, showPriceAxis = false, showGrid = false, pinCrosshair = false, activeDrawTool = null, onDrawToolComplete, hideDrawings = false, clearDrawSignal, onDrawingsChange }: StockPriceChartProps) => {
  // Recharts synchronizes charts sharing a syncId via a registry keyed by
  // that exact string, shared across the whole app -- not scoped per
  // component instance. A syncId built only from symbol+timeframe (as this
  // used to be) collides between the embedded card chart and the fullscreen
  // chart whenever they show the same stock/period, silently merging their
  // sub-panel sync groups. When one instance then unmounts (e.g. closing
  // fullscreen), the other can be left reading corrupted sync state and
  // render blank until something unrelated forces a fresh remount. useId()
  // gives every mounted instance its own id, so instances never collide.
  const instanceId = useId();
  const syncId = `chart-${instanceId}-${symbol}-${timeframe}`;
  const data = useMemo(() => liveData ?? [], [liveData]);
  const firstPrice = data[0]?.price || 0;
  const lastPrice = data[data.length - 1]?.price || 0;
  const isPositive = lastPrice >= firstPrice;
  const lineColor = isPositive ? "hsl(var(--bull))" : "hsl(var(--bear))";
  const gradientId = `gs-${symbol}-${timeframe}`;

  // Overlay indicators (drawn on the price chart itself) + sub-panel indicator
  // (Volume / MACD / RSI, drawn in their own panel below since they need a
  // different y-scale entirely). Computed once per data/indicator-toggle change.
  const chartData = useMemo(() => {
    const ma5 = sma(data, 5), ma20 = sma(data, 20), ma50 = sma(data, 50);
    const ema12 = ema(data, 12), ema26 = ema(data, 26);
    const boll = bollingerBands(data, 20, 2);
    const rsiVals = rsi(data, 14);
    const { macdLine, signal, histogram } = macd(data, 12, 26, 9);
    const sar = parabolicSAR(data);
    const { k: kdjK, d: kdjD, j: kdjJ } = kdj(data);
    const wr = williamsR(data);
    const cciVals = cci(data);
    return data.map((d, i) => ({
      ...d,
      ma5: ma5[i], ma20: ma20[i], ma50: ma50[i],
      ema12: ema12[i], ema26: ema26[i],
      bollUpper: boll[i].upper, bollMid: boll[i].mid, bollLower: boll[i].lower,
      rsi: rsiVals[i],
      macdLine: macdLine[i], macdSignal: signal[i], macdHist: histogram[i],
      sar: sar[i],
      kdjK: kdjK[i], kdjD: kdjD[i], kdjJ: kdjJ[i],
      wr: wr[i],
      cci: cciVals[i],
      volume: d.volume ?? 0,
    }));
  }, [data]);

  const minPrice = Math.min(
    ...data.map(d => d.low ?? d.price),
    ...(indicators.overlays.boll ? chartData.map(d => d.bollLower ?? Infinity).filter(Number.isFinite) : []),
  );
  const maxPrice = Math.max(
    ...data.map(d => d.high ?? d.price),
    ...(indicators.overlays.boll ? chartData.map(d => d.bollUpper ?? -Infinity).filter(Number.isFinite) : []),
  );
  const padding = (maxPrice - minPrice) * 0.15;

  // Price-axis zoom (TradingView/Moomoo style): dragging the right-hand price
  // scale stretches or compresses the visible price range around its own
  // center without touching the data, x-axis, or panel heights. 1 = the
  // normal auto-fit range; >1 zooms out (shorter-looking candles), <1 zooms
  // in. Resets whenever the timeframe/symbol changes so a new period always
  // starts auto-fit.
  const [axisZoom, setAxisZoom] = useState(1);
  useEffect(() => { setAxisZoom(1); }, [timeframe, symbol]);
  const axisDragRef = useRef<{ startY: number; startZoom: number } | null>(null);
  const handleAxisDragStart = useCallback((e: React.PointerEvent) => {
    if (!showPriceAxis) return;
    e.preventDefault();
    axisDragRef.current = { startY: e.clientY, startZoom: axisZoom };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }, [showPriceAxis, axisZoom]);
  const handleAxisDragMove = useCallback((e: React.PointerEvent) => {
    const start = axisDragRef.current;
    if (!start) return;
    const dy = e.clientY - start.startY;
    // Drag down = zoom out (taller range, chart looks flatter); drag up = zoom in.
    const next = Math.min(4, Math.max(0.25, start.startZoom * (1 + dy / 150)));
    setAxisZoom(next);
  }, []);
  const handleAxisDragEnd = useCallback(() => { axisDragRef.current = null; }, []);
  const handleAxisDoubleClick = useCallback(() => setAxisZoom(1), []);

  // Crosshair overlay position. Recharts v3 no longer hands mouse/touch handlers an
  // `activePayload` — it hands them a small { activeIndex, activeCoordinate, ... } state
  // object as the FIRST argument (the raw DOM event is the second argument). activeCoordinate.y
  // is NOT reliably snapped to the plotted value's pixel position (it can trail the actual
  // mouse/touch position instead), so the dot would drift off the line. We only trust
  // activeCoordinate.x (the category/index position, which recharts gets right), and derive
  // the y pixel ourselves from the real price value + the measured plot area + the known
  // domain/margins — guaranteeing the dot always sits exactly on the price line. This same
  // handler is wired to both onMouseMove (desktop) and onTouchMove (mobile drag) — v3
  // requires touch to be wired explicitly, it is no longer inferred from onMouseMove.
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; fraction: number } | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const PLOT_MARGIN_TOP = 8;

  const autoDomainMin = minPrice - padding;
  const autoDomainMax = maxPrice + padding;
  const domainCenter = (autoDomainMin + autoDomainMax) / 2;
  const domainHalf = ((autoDomainMax - autoDomainMin) / 2) * axisZoom;
  const domainMin = domainCenter - domainHalf;
  const domainMax = domainCenter + domainHalf;

  const updateFromChartState = useCallback((state: { activeIndex?: number | string; activeCoordinate?: { x: number; y?: number } } | null) => {
    const idx = state?.activeIndex != null ? Number(state.activeIndex) : NaN;
    const coord = state?.activeCoordinate;
    if (Number.isFinite(idx) && data[idx] && coord) {
      const point = data[idx];
      const rect = plotRef.current?.getBoundingClientRect();
      const plotHeight = rect ? Math.max(1, rect.height - PLOT_MARGIN_TOP) : 0;
      const priceY = domainMax === domainMin
        ? PLOT_MARGIN_TOP + plotHeight / 2
        : PLOT_MARGIN_TOP + (1 - (point.price - domainMin) / (domainMax - domainMin)) * plotHeight;
      const plotWidth = rect?.width || 1;
      setCrosshair({ x: coord.x, y: priceY, fraction: Math.min(1, Math.max(0, coord.x / plotWidth)) });
      // Change is always relative to the first point of the currently selected
      // timeframe, so scrubbing a 1M chart shows gain/loss vs. a month ago, not vs. today.
      const pointChangePercent = firstPrice ? ((point.price - firstPrice) / firstPrice) * 100 : 0;
      const pointIsUp = point.price >= firstPrice;
      onHoverPrice?.(point.price, point.date, pointChangePercent, pointIsUp);
      chartHaptic();
    }
  }, [data, onHoverPrice, firstPrice, domainMin, domainMax]);

  const handleLeave = useCallback(() => {
    if (pinCrosshair) return;
    setCrosshair(null);
    onHoverPrice?.(null, null, null, null);
  }, [onHoverPrice, pinCrosshair]);

  // ---- Drawing tools -------------------------------------------------------
  // Every drawing is stored as (relative-x-fraction, real price) points rather
  // than raw pixels, so it's genuinely anchored to the data: zooming the
  // price axis (axisZoom above) or resizing the pane recomputes the pixel
  // position correctly instead of a drawing drifting off what it was drawn on.
  const [activeDrawings, setActiveDrawings] = useState<Drawing[]>([]);
  const [pendingPoints, setPendingPoints] = useState<DrawPoint[]>([]);
  const pendingPointsRef = useRef<DrawPoint[]>([]);
  const [hoverPoint, setHoverPoint] = useState<DrawPoint | null>(null);
  const drawIdRef = useRef(0);

  // Plot pixel size, tracked reactively (not just read on-demand) so stored
  // drawings re-render at the right spot whenever the pane resizes.
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setPlotSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pixelToDrawValue = useCallback((clientX: number, clientY: number): DrawPoint | null => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    const xFrac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const plotHeight = Math.max(1, rect.height - PLOT_MARGIN_TOP);
    const price = domainMax - ((clientY - rect.top - PLOT_MARGIN_TOP) / plotHeight) * (domainMax - domainMin);
    return { xFrac, price };
  }, [domainMin, domainMax]);

  const drawValueToPixel = useCallback((xFrac: number, price: number): { x: number; y: number } | null => {
    if (!plotSize.width || !plotSize.height) return null;
    const plotHeight = Math.max(1, plotSize.height - PLOT_MARGIN_TOP);
    const x = xFrac * plotSize.width;
    const y = domainMax === domainMin
      ? PLOT_MARGIN_TOP + plotHeight / 2
      : PLOT_MARGIN_TOP + (1 - (price - domainMin) / (domainMax - domainMin)) * plotHeight;
    return { x, y };
  }, [plotSize, domainMin, domainMax]);

  // New timeframe/symbol = a different price range and time window, so any
  // existing sketch no longer refers to anything meaningful on screen.
  useEffect(() => {
    setActiveDrawings([]);
    pendingPointsRef.current = [];
    setPendingPoints([]);
    setHoverPoint(null);
  }, [timeframe, symbol]);
  // Caller-driven "clear all" (e.g. a toolbar trash icon) via a bump counter.
  useEffect(() => {
    if (clearDrawSignal === undefined) return;
    setActiveDrawings([]);
  }, [clearDrawSignal]);
  // Switching tools (including exiting draw mode) abandons any half-placed
  // shape rather than carrying stray points into the next tool.
  useEffect(() => {
    pendingPointsRef.current = [];
    setPendingPoints([]);
    setHoverPoint(null);
  }, [activeDrawTool]);
  useEffect(() => { onDrawingsChange?.(activeDrawings.length > 0); }, [activeDrawings.length, onDrawingsChange]);

  const handleDrawTap = useCallback((e: React.PointerEvent) => {
    if (!activeDrawTool) return;
    const v = pixelToDrawValue(e.clientX, e.clientY);
    if (!v) return;
    const def = DRAW_TOOL_LOOKUP[activeDrawTool];
    const next = [...pendingPointsRef.current, v];
    if (next.length >= def.points) {
      let text: string | undefined;
      if (def.needsText) {
        const promptLabel = def.id === "notes" ? "Note text" : def.id === "callout" ? "Callout text" : "Label text";
        text = typeof window !== "undefined" ? (window.prompt(promptLabel)?.trim() || undefined) : undefined;
      }
      setActiveDrawings((ds) => [...ds, { id: ++drawIdRef.current, tool: activeDrawTool, points: next, text }]);
      pendingPointsRef.current = [];
      setPendingPoints([]);
      setHoverPoint(null);
      onDrawToolComplete?.();
    } else {
      pendingPointsRef.current = next;
      setPendingPoints(next);
    }
  }, [activeDrawTool, pixelToDrawValue, onDrawToolComplete]);

  const handleDrawHover = useCallback((e: React.PointerEvent) => {
    if (!activeDrawTool || pendingPointsRef.current.length === 0) return;
    const v = pixelToDrawValue(e.clientX, e.clientY);
    if (v) setHoverPoint(v);
  }, [activeDrawTool, pixelToDrawValue]);

  // Renders one drawing's geometry as SVG, working from real price/xFrac
  // points converted to pixels fresh every render (via drawValueToPixel), so
  // axis-zoom and resize always land in the right spot. Degrades gracefully
  // when fewer points than the tool needs are available yet -- that's what
  // powers the in-progress preview while someone's still tapping points in.
  const renderToolShape = (tool: DrawToolId, points: DrawPoint[], opts?: { draft?: boolean; text?: string }) => {
    const P = points.map((pt) => drawValueToPixel(pt.xFrac, pt.price));
    const [p1, p2, p3] = P;
    if (!p1) return null;
    const draft = !!opts?.draft;
    const stroke = "#f59e0b";
    const dash = draft ? "4 3" : undefined;
    const opacity = draft ? 0.85 : 1;
    const W = plotSize.width, H = plotSize.height;
    const Ln = (a: { x: number; y: number }, b: { x: number; y: number }, extra?: Record<string, unknown>) => (
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} strokeLinecap="round" opacity={opacity} {...extra} />
    );
    const Dot = (a: { x: number; y: number }) => <circle cx={a.x} cy={a.y} r={2.5} fill={stroke} opacity={opacity} />;
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const add = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + b.x, y: a.y + b.y });
    const sub = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x - b.x, y: a.y - b.y });
    const scale = (a: { x: number; y: number }, k: number) => ({ x: a.x * k, y: a.y * k });
    const priceToY = (price: number) => drawValueToPixel(0, price)?.y ?? p1.y;

    switch (tool) {
      // ---- Lines ----
      case "trend-line":
        return p2 ? <g key="s">{Ln(p1, p2)}{draft && <>{Dot(p1)}{Dot(p2)}</>}</g> : Dot(p1);
      case "horizontal-line":
        return Ln({ x: 0, y: p1.y }, { x: W, y: p1.y });
      case "horizontal-ray":
        return <g key="s">{Ln(p1, { x: W, y: p1.y })}{Dot(p1)}</g>;
      case "horizontal-segment":
        return p2 ? Ln({ x: Math.min(p1.x, p2.x), y: p1.y }, { x: Math.max(p1.x, p2.x), y: p1.y }) : Dot(p1);
      case "vertical-line":
        return Ln({ x: p1.x, y: PLOT_MARGIN_TOP }, { x: p1.x, y: H });
      case "cross-line":
        return (
          <g key="s">
            {Ln({ x: 0, y: p1.y }, { x: W, y: p1.y })}
            {Ln({ x: p1.x, y: PLOT_MARGIN_TOP }, { x: p1.x, y: H })}
            {Dot(p1)}
          </g>
        );
      case "extended-line": {
        if (!p2) return Dot(p1);
        const dx = p2.x - p1.x;
        if (Math.abs(dx) < 0.5) return Ln({ x: p1.x, y: PLOT_MARGIN_TOP }, { x: p1.x, y: H });
        const slope = (p2.y - p1.y) / dx;
        const yAt0 = p1.y - slope * p1.x;
        const yAtW = p1.y + slope * (W - p1.x);
        return Ln({ x: 0, y: yAt0 }, { x: W, y: yAtW });
      }
      case "trend-angle": {
        if (!p2) return Dot(p1);
        const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
        const m = mid(p1, p2);
        return (
          <g key="s">
            {Ln(p1, p2)}
            <text x={m.x} y={m.y - 6} fontSize={10} fill={stroke} textAnchor="middle" opacity={opacity}>{angle.toFixed(1)}°</text>
          </g>
        );
      }
      case "info-line": {
        if (!p2 || points.length < 2) return Dot(p1);
        const delta = points[1].price - points[0].price;
        const pct = points[0].price ? (delta / points[0].price) * 100 : 0;
        const m = mid(p1, p2);
        return (
          <g key="s">
            {Ln(p1, p2)}
            <text x={m.x} y={m.y - 6} fontSize={10} fill={stroke} textAnchor="middle" opacity={opacity}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(2)} ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
            </text>
          </g>
        );
      }

      // ---- Channels & Pitchforks (all 3-point) ----
      case "parallel-lines":
      case "parallel-channel": {
        if (!p2) return Dot(p1);
        if (!p3) return Ln(p1, p2);
        const baseMid = mid(p1, p2);
        const offset = sub(p3, baseMid);
        const p1b = add(p1, offset), p2b = add(p2, offset);
        return (
          <g key="s">
            {Ln(p1, p2)}
            {Ln(p1b, p2b)}
            {tool === "parallel-channel" && (
              <>
                <polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p2b.x},${p2b.y} ${p1b.x},${p1b.y}`} fill={stroke} fillOpacity={0.08} stroke="none" />
                <line x1={mid(p1, p1b).x} y1={mid(p1, p1b).y} x2={mid(p2, p2b).x} y2={mid(p2, p2b).y} stroke={stroke} strokeDasharray="2 3" strokeOpacity={0.5} />
              </>
            )}
          </g>
        );
      }
      case "flat-channel": {
        if (!p2) return Dot(p1);
        if (!p3) return Ln(p1, p2);
        const xStart = Math.min(p1.x, p2.x), xEnd = Math.max(p1.x, p2.x);
        return <g key="s">{Ln(p1, p2)}{Ln({ x: xStart, y: p3.y }, { x: xEnd, y: p3.y })}</g>;
      }
      case "disjoint-channel": {
        if (!p2) return Dot(p1);
        if (!p3) return Ln(p1, p2);
        const mirrored = { x: p2.x - p1.x, y: -(p2.y - p1.y) };
        return <g key="s">{Ln(p1, p2)}{Ln(p3, add(p3, mirrored))}</g>;
      }
      case "pitchfork":
      case "schiff-pitchfork":
      case "modified-schiff-pitchfork":
      case "inside-pitchfork": {
        if (!p2) return Dot(p1);
        if (!p3) return Ln(p1, p2);
        const mid23 = mid(p2, p3);
        const anchor = tool === "schiff-pitchfork" ? mid(p1, mid23)
          : tool === "modified-schiff-pitchfork" ? mid(p1, p2)
          : tool === "inside-pitchfork" ? mid23
          : p1;
        const dir = tool === "inside-pitchfork" ? sub(p1, anchor) : sub(mid23, anchor);
        const medianEnd = add(anchor, scale(dir, 2.4));
        const outer = scale(dir, 2.0);
        return (
          <g key="s">
            <line x1={anchor.x} y1={anchor.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.4} />
            <line x1={anchor.x} y1={anchor.y} x2={p3.x} y2={p3.y} stroke={stroke} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.4} />
            {Ln(anchor, medianEnd)}
            {Ln(p2, add(p2, outer))}
            {Ln(p3, add(p3, outer))}
          </g>
        );
      }

      // ---- Shapes ----
      case "rectangle": {
        if (!p2) return Dot(p1);
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        return <rect x={x} y={y} width={Math.abs(p2.x - p1.x)} height={Math.abs(p2.y - p1.y)} fill={stroke} fillOpacity={0.08} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={opacity} />;
      }
      case "circle": {
        if (!p2) return Dot(p1);
        const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        return <circle cx={p1.x} cy={p1.y} r={r} fill={stroke} fillOpacity={0.08} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={opacity} />;
      }
      case "ellipse": {
        if (!p2) return Dot(p1);
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        return <ellipse cx={cx} cy={cy} rx={Math.abs(p2.x - p1.x) / 2} ry={Math.abs(p2.y - p1.y) / 2} fill={stroke} fillOpacity={0.08} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={opacity} />;
      }
      case "triangle": {
        if (!p2) return Dot(p1);
        if (!p3) return Ln(p1, p2);
        return <polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill={stroke} fillOpacity={0.08} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={opacity} />;
      }
      case "parallelogram": {
        if (!p2) return Dot(p1);
        if (!p3) return Ln(p1, p2);
        const p4 = add(p1, sub(p3, p2));
        return <polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`} fill={stroke} fillOpacity={0.08} stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={opacity} />;
      }

      // ---- Measures ----
      case "price-range": {
        if (!p2 || points.length < 2) return Dot(p1);
        const delta = points[1].price - points[0].price;
        const pct = points[0].price ? (delta / points[0].price) * 100 : 0;
        const color = delta >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))";
        const x = (p1.x + p2.x) / 2;
        return (
          <g key="s">
            <line x1={x} y1={p1.y} x2={x} y2={p2.y} stroke={color} strokeWidth={1.5} opacity={opacity} />
            <line x1={x - 6} y1={p1.y} x2={x + 6} y2={p1.y} stroke={color} strokeWidth={1.5} opacity={opacity} />
            <line x1={x - 6} y1={p2.y} x2={x + 6} y2={p2.y} stroke={color} strokeWidth={1.5} opacity={opacity} />
            {!draft && <text x={x + 10} y={(p1.y + p2.y) / 2} fontSize={10} fill={color}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)} ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</text>}
          </g>
        );
      }
      case "date-range":
      case "bars-pattern": {
        if (!p2 || points.length < 2) return Dot(p1);
        const bars = Math.max(1, Math.round(Math.abs(points[1].xFrac - points[0].xFrac) * Math.max(1, data.length - 1)));
        const y = (p1.y + p2.y) / 2;
        return (
          <g key="s">
            <line x1={p1.x} y1={y} x2={p2.x} y2={y} stroke={stroke} strokeWidth={1.5} strokeDasharray={tool === "bars-pattern" ? "3 3" : dash} opacity={opacity} />
            <line x1={p1.x} y1={y - 6} x2={p1.x} y2={y + 6} stroke={stroke} strokeWidth={1.5} opacity={opacity} />
            <line x1={p2.x} y1={y - 6} x2={p2.x} y2={y + 6} stroke={stroke} strokeWidth={1.5} opacity={opacity} />
            {!draft && <text x={(p1.x + p2.x) / 2} y={y - 10} fontSize={10} fill={stroke} textAnchor="middle">{bars} bars</text>}
          </g>
        );
      }
      case "date-price-range": {
        if (!p2 || points.length < 2) return Dot(p1);
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const delta = points[1].price - points[0].price;
        const pct = points[0].price ? (delta / points[0].price) * 100 : 0;
        const bars = Math.max(1, Math.round(Math.abs(points[1].xFrac - points[0].xFrac) * Math.max(1, data.length - 1)));
        const color = delta >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))";
        return (
          <g key="s">
            <rect x={x} y={y} width={Math.abs(p2.x - p1.x)} height={Math.abs(p2.y - p1.y)} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={1.3} strokeDasharray="4 3" opacity={opacity} />
            {!draft && <text x={x + 6} y={y + 14} fontSize={10} fill={color}>{delta >= 0 ? "+" : ""}{pct.toFixed(2)}% · {bars} bars</text>}
          </g>
        );
      }
      case "long-position":
      case "short-position": {
        if (!p2 || points.length < 2) return Dot(p1);
        const entry = points[0].price;
        const reward = Math.abs(points[1].price - entry);
        const risk = reward / 2 || entry * 0.01;
        const isLong = tool === "long-position";
        const targetPrice = isLong ? entry + reward : entry - reward;
        const stopPrice = isLong ? entry - risk : entry + risk;
        const xStart = Math.min(p1.x, p2.x), xEnd = Math.max(p1.x, p2.x);
        const entryY = p1.y, targetY = priceToY(targetPrice), stopY = priceToY(stopPrice);
        const width = Math.max(28, xEnd - xStart);
        return (
          <g key="s">
            <rect x={xStart} y={Math.min(entryY, targetY)} width={width} height={Math.abs(targetY - entryY)} fill="hsl(var(--bull))" fillOpacity={0.15} opacity={opacity} />
            <rect x={xStart} y={Math.min(entryY, stopY)} width={width} height={Math.abs(stopY - entryY)} fill="hsl(var(--bear))" fillOpacity={0.15} opacity={opacity} />
            <line x1={xStart} y1={entryY} x2={xEnd} y2={entryY} stroke="hsl(var(--foreground))" strokeWidth={1.3} opacity={opacity} />
            {!draft && (
              <>
                <text x={xStart + 4} y={Math.min(entryY, targetY) + 12} fontSize={9} fill="hsl(var(--bull))">+{((reward / entry) * 100).toFixed(2)}%</text>
                <text x={xStart + 4} y={Math.max(entryY, stopY) - 4} fontSize={9} fill="hsl(var(--bear))">-{((risk / entry) * 100).toFixed(2)}%</text>
                <text x={xEnd - 4} y={entryY - 4} fontSize={9} fill="hsl(var(--foreground))" textAnchor="end">1:2</text>
              </>
            )}
          </g>
        );
      }

      // ---- Items ----
      case "price-label": {
        const label = points[0].price.toFixed(2);
        const w = 8 * label.length + 12;
        return (
          <g key="s" opacity={opacity}>
            <rect x={p1.x - 4} y={p1.y - 10} width={w} height={18} rx={3} fill={stroke} />
            <text x={p1.x - 4 + w / 2} y={p1.y + 3} fontSize={10} fontWeight={700} fill="hsl(var(--background))" textAnchor="middle">{label}</text>
          </g>
        );
      }
      case "text": {
        const label = opts?.text || "Text";
        return <text key="s" x={p1.x} y={p1.y} fontSize={11} fill={stroke} opacity={opacity}>{label}</text>;
      }
      case "notes": {
        const label = opts?.text || "Note";
        return (
          <g key="s" opacity={opacity}>
            <circle cx={p1.x} cy={p1.y} r={4} fill={stroke} />
            <text x={p1.x + 9} y={p1.y + 3} fontSize={10} fill={stroke}>{label}</text>
          </g>
        );
      }
      case "flag": {
        return (
          <g key="s" opacity={opacity}>
            <line x1={p1.x} y1={p1.y} x2={p1.x} y2={p1.y - 20} stroke={stroke} strokeWidth={1.5} />
            <polygon points={`${p1.x},${p1.y - 20} ${p1.x + 12},${p1.y - 16} ${p1.x},${p1.y - 12}`} fill={stroke} />
          </g>
        );
      }
      case "arrow": {
        if (!p2) return Dot(p1);
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const ah = 8;
        const a1 = { x: p2.x - ah * Math.cos(angle - Math.PI / 6), y: p2.y - ah * Math.sin(angle - Math.PI / 6) };
        const a2 = { x: p2.x - ah * Math.cos(angle + Math.PI / 6), y: p2.y - ah * Math.sin(angle + Math.PI / 6) };
        return <g key="s">{Ln(p1, p2)}<polygon points={`${p2.x},${p2.y} ${a1.x},${a1.y} ${a2.x},${a2.y}`} fill={stroke} opacity={opacity} /></g>;
      }
      case "callout": {
        if (!p2) return Dot(p1);
        const label = opts?.text || "Note";
        const w = 7 * label.length + 16;
        return (
          <g key="s" opacity={opacity}>
            {Ln(p1, p2)}
            <rect x={p2.x - w / 2} y={p2.y - 22} width={w} height={20} rx={4} fill="hsl(var(--card))" stroke={stroke} strokeWidth={1} />
            <text x={p2.x} y={p2.y - 8} fontSize={10} fill={stroke} textAnchor="middle">{label}</text>
          </g>
        );
      }
      default:
        return null;
    }
  };

  const renderDrawLayer = () => {
    const axisGutter = showPriceAxis ? PRICE_AXIS_WIDTH : 0;
    const previewPoints = activeDrawTool && hoverPoint ? [...pendingPoints, hoverPoint] : pendingPoints;
    return (
      <>
        <div
          className="absolute top-0 left-0 bottom-0 z-10"
          style={{ right: axisGutter, touchAction: activeDrawTool ? "none" : undefined, pointerEvents: activeDrawTool ? "auto" : "none", cursor: activeDrawTool ? "crosshair" : undefined }}
          onPointerUp={handleDrawTap}
          onPointerMove={handleDrawHover}
        />
        {(activeDrawings.length > 0 || previewPoints.length > 0) && (
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            {!hideDrawings && activeDrawings.map((d) => (
              <g key={d.id}>{renderToolShape(d.tool, d.points, { text: d.text })}</g>
            ))}
            {activeDrawTool && previewPoints.length > 0 && (
              <g>{renderToolShape(activeDrawTool, previewPoints, { draft: true })}</g>
            )}
          </svg>
        )}
      </>
    );
  };
  // ---------------------------------------------------------------------

  const domain: [number, number] = [domainMin, domainMax];

  // Price line is two-tone: the actual bull/bear color up to the crosshair, and grey
  // beyond it — the fraction defaults to 1 (fully colored) when nothing is being dragged.
  const crosshairGradId = `ch-${symbol}-${timeframe}`;
  const greyLineColor = "hsl(var(--muted-foreground))";
  const crosshairFraction = crosshair ? crosshair.fraction : 1;

  const renderCrosshair = () => {
    if (!crosshair) return null;
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-px bg-foreground/30" style={{ left: crosshair.x, top: 0, bottom: 0 }} />
        <div
          className="absolute h-2.5 w-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-background"
          style={{ left: crosshair.x, top: crosshair.y, backgroundColor: lineColor }}
        />
      </div>
    );
  };

  const PRICE_AXIS_WIDTH = 52;

  // Highlighted "current price" tag on the right-hand scale, drawn as part of
  // the ReferenceLine so it always tracks the real plot coordinates (no manual
  // pixel math needed). Recharts hands a horizontal ReferenceLine's label
  // renderer a viewBox already sized to the plot area, so x + width lands
  // exactly at the start of the axis gutter we reserved via YAxis width.
  const renderCurrentPriceTag = (props: { viewBox?: { x: number; y: number; width: number; height: number } }) => {
    const { viewBox } = props;
    if (!viewBox) return null;
    const tagWidth = PRICE_AXIS_WIDTH - 2;
    const tagHeight = 16;
    const x = viewBox.x + viewBox.width + 1;
    const y = viewBox.y;
    return (
      <g>
        <rect x={x} y={y - tagHeight / 2} width={tagWidth} height={tagHeight} rx={2} fill={lineColor} />
        <text x={x + tagWidth / 2} y={y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="hsl(var(--background))">
          {lastPrice.toFixed(2)}
        </text>
      </g>
    );
  };

  // Invisible strip laid over the price-scale gutter so a vertical drag there
  // zooms the axis (TradingView/Moomoo style) without interfering with the
  // crosshair drag, which listens on the plot area itself. Double-tap resets
  // to auto-fit.
  const renderPriceAxisDragHandle = () => (
    <div
      className="absolute top-0 right-0 bottom-0 z-10 touch-none cursor-ns-resize"
      style={{ width: PRICE_AXIS_WIDTH }}
      onPointerDown={handleAxisDragStart}
      onPointerMove={handleAxisDragMove}
      onPointerUp={handleAxisDragEnd}
      onPointerCancel={handleAxisDragEnd}
      onDoubleClick={handleAxisDoubleClick}
    />
  );

  // Overlay lines share one distinct palette so MA/EMA/BOLL stay visually
  // separable from each other and from the price series itself.
  const OVERLAY_COLORS = { ma5: "#f59e0b", ma20: "#3b82f6", ma50: "#8b5cf6", ema12: "#14b8a6", ema26: "#ec4899", boll: "#94a3b8", sar: "#f59e0b" };

  const renderOverlays = () => (
    <>
      {indicators.overlays.ma && (
        <>
          <Line type="monotone" dataKey="ma5" stroke={OVERLAY_COLORS.ma5} strokeWidth={1.1} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="ma20" stroke={OVERLAY_COLORS.ma20} strokeWidth={1.1} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="ma50" stroke={OVERLAY_COLORS.ma50} strokeWidth={1.1} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </>
      )}
      {indicators.overlays.ema && (
        <>
          <Line type="monotone" dataKey="ema12" stroke={OVERLAY_COLORS.ema12} strokeWidth={1.1} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="ema26" stroke={OVERLAY_COLORS.ema26} strokeWidth={1.1} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </>
      )}
      {indicators.overlays.boll && (
        <>
          <Line type="monotone" dataKey="bollUpper" stroke={OVERLAY_COLORS.boll} strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="bollMid" stroke={OVERLAY_COLORS.boll} strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="bollLower" stroke={OVERLAY_COLORS.boll} strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </>
      )}
      {indicators.overlays.sar && (
        <Line
          type="monotone"
          dataKey="sar"
          stroke={OVERLAY_COLORS.sar}
          strokeWidth={0}
          dot={{ r: 1.6, fill: OVERLAY_COLORS.sar, strokeWidth: 0 }}
          activeDot={false}
          isAnimationActive={false}
          connectNulls
        />
      )}
    </>
  );

  const renderSubPanel = () => {
    if (indicators.subPanel === "rsi") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} syncId={syncId}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[0, 100]} width={showPriceAxis ? PRICE_AXIS_WIDTH : 0} />
            <Tooltip content={() => null} cursor={false} />
            <ReferenceLine y={70} stroke="hsl(var(--bear))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <ReferenceLine y={30} stroke="hsl(var(--bull))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <Line type="monotone" dataKey="rsi" stroke="#a855f7" strokeWidth={1.3} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    if (indicators.subPanel === "macd") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} syncId={syncId}>
            <XAxis dataKey="date" hide />
            <YAxis hide width={showPriceAxis ? PRICE_AXIS_WIDTH : 0} />
            <Tooltip content={() => null} cursor={false} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.35} />
            <Bar dataKey="macdHist" isAnimationActive={false} barSize={2}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={(d.macdHist ?? 0) >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))"} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macdLine" stroke="#3b82f6" strokeWidth={1.2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1.2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    if (indicators.subPanel === "kdj") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} syncId={syncId}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[-20, 120]} width={showPriceAxis ? PRICE_AXIS_WIDTH : 0} />
            <Tooltip content={() => null} cursor={false} />
            <ReferenceLine y={80} stroke="hsl(var(--bear))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <ReferenceLine y={20} stroke="hsl(var(--bull))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <Line type="monotone" dataKey="kdjK" stroke="#3b82f6" strokeWidth={1.2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="kdjD" stroke="#f59e0b" strokeWidth={1.2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="kdjJ" stroke="#a855f7" strokeWidth={1.2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    if (indicators.subPanel === "wr") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} syncId={syncId}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[-100, 0]} width={showPriceAxis ? PRICE_AXIS_WIDTH : 0} />
            <Tooltip content={() => null} cursor={false} />
            <ReferenceLine y={-20} stroke="hsl(var(--bear))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <ReferenceLine y={-80} stroke="hsl(var(--bull))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <Line type="monotone" dataKey="wr" stroke="#ec4899" strokeWidth={1.3} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    if (indicators.subPanel === "cci") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} syncId={syncId}>
            <XAxis dataKey="date" hide />
            <YAxis hide width={showPriceAxis ? PRICE_AXIS_WIDTH : 0} />
            <Tooltip content={() => null} cursor={false} />
            <ReferenceLine y={100} stroke="hsl(var(--bear))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <ReferenceLine y={-100} stroke="hsl(var(--bull))" strokeOpacity={0.35} strokeDasharray="2 3" />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.3} />
            <Line type="monotone" dataKey="cci" stroke="#0ea5e9" strokeWidth={1.3} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  const hasSubPanel = indicators.subPanel !== "none";
  const hasVolume = indicators.volume;
  // Bar width shared by the candle body/wick bars and the volume bars so the
  // two stay visually aligned bar-for-bar (same syncId keeps their x-position
  // locked together too).
  const barSize = data.length > 120 ? 2 : data.length > 60 ? 4 : 7;

  const renderVolumePanel = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} syncId={syncId}>
        <XAxis dataKey="date" hide />
        <YAxis hide domain={[0, (max: number) => max * 1.15]} width={showPriceAxis ? PRICE_AXIS_WIDTH : 0} />
        <Tooltip content={() => null} cursor={false} />
        <Bar dataKey="volume" barSize={barSize} isAnimationActive={false} minPointSize={1}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.up ? "hsl(var(--bull))" : "hsl(var(--bear))"} fillOpacity={0.55} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );

  const VolumePanel = () => (
    <div className="shrink-0 border-t border-border/30 pt-1 relative" style={{ height: VOLUME_PANEL_HEIGHT }}>
      <span className="absolute top-0.5 left-1 text-[9px] font-bold text-muted-foreground tracking-wide z-10">VOL</span>
      {renderVolumePanel()}
    </div>
  );

  // The main pane either gets a hard-coded pixel height (embedded chart,
  // `mainHeight` passed in -- never shrinks when Volume/a sub-panel is
  // switched on, they just add their own fixed height below) or fills
  // whatever's left in a flex parent (fullscreen chart, already
  // viewport-bounded so there's nowhere for extra height to go).
  const mainPaneStyle = mainHeight ? { height: mainHeight, flex: "0 0 auto" as const } : undefined;
  const mainPaneClass = mainHeight ? "shrink-0 relative" : "flex-1 min-h-0 relative";
  const outerClass = `relative w-full flex flex-col touch-none ${mainHeight ? "" : "h-full"}`;

  if (chartType === "candle") {
    return (
      <div className={outerClass} onTouchEnd={handleLeave}>
        <div ref={plotRef} className={mainPaneClass} style={mainPaneStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
              onMouseMove={updateFromChartState}
              onMouseLeave={handleLeave}
              onTouchMove={updateFromChartState}
              syncId={syncId}
            >
              {showGrid && <CartesianGrid horizontal vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} strokeDasharray="3 3" />}
              <XAxis dataKey="date" hide />
              <YAxis
                hide={!showPriceAxis}
                orientation="right"
                domain={domain}
                width={showPriceAxis ? PRICE_AXIS_WIDTH : 0}
                axisLine={false}
                tickLine={false}
                tickCount={6}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip content={() => null} cursor={false} />
              {showPriceAxis && (
                <ReferenceLine y={lastPrice} stroke={lineColor} strokeDasharray="3 3" strokeOpacity={0.6} label={renderCurrentPriceTag} />
              )}
              <Bar dataKey="wickRange" barSize={1} isAnimationActive={false} activeBar={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.up ? "hsl(var(--bull))" : "hsl(var(--bear))"} />
                ))}
              </Bar>
              <Bar dataKey="body" barSize={barSize} isAnimationActive={false} minPointSize={1} activeBar={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.up ? "hsl(var(--bull))" : "hsl(var(--bear))"} />
                ))}
              </Bar>
              {renderOverlays()}
            </ComposedChart>
          </ResponsiveContainer>
          {renderCrosshair()}
          {showPriceAxis && renderPriceAxisDragHandle()}
          {renderDrawLayer()}
        </div>
        {hasVolume && <VolumePanel />}
        {hasSubPanel && <div className="shrink-0 border-t border-border/30 pt-1" style={{ height: SUB_PANEL_HEIGHT }}>{renderSubPanel()}</div>}
      </div>
    );
  }

  return (
    <div className={outerClass} onTouchEnd={handleLeave}>
      <div ref={plotRef} className={mainPaneClass} style={mainPaneStyle}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
            onMouseMove={updateFromChartState}
            onMouseLeave={handleLeave}
            onTouchMove={updateFromChartState}
            syncId={syncId}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.45} />
                <stop offset="35%" stopColor={lineColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={crosshairGradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset={0} stopColor={lineColor} />
                <stop offset={crosshairFraction} stopColor={lineColor} />
                <stop offset={crosshairFraction} stopColor={greyLineColor} />
                <stop offset={1} stopColor={greyLineColor} />
              </linearGradient>
            </defs>
            {showGrid && <CartesianGrid horizontal vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} strokeDasharray="3 3" />}
            <XAxis dataKey="date" hide />
            <YAxis
              hide={!showPriceAxis}
              orientation="right"
              domain={domain}
              width={showPriceAxis ? PRICE_AXIS_WIDTH : 0}
              axisLine={false}
              tickLine={false}
              tickCount={6}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip content={() => null} cursor={false} />
            <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="2 4" strokeOpacity={0.35} />
            {showPriceAxis && (
              <ReferenceLine y={lastPrice} stroke={lineColor} strokeDasharray="3 3" strokeOpacity={0.6} label={renderCurrentPriceTag} />
            )}
            <Area
              type="monotone"
              dataKey="price"
              stroke={`url(#${crosshairGradId})`}
              strokeWidth={1.6}
              fill={chartType === "area" ? `url(#${gradientId})` : "transparent"}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {renderOverlays()}
          </ComposedChart>
        </ResponsiveContainer>
        {renderCrosshair()}
        {showPriceAxis && renderPriceAxisDragHandle()}
        {renderDrawLayer()}
      </div>
      {hasVolume && <VolumePanel />}
      {hasSubPanel && <div className="shrink-0 border-t border-border/30 pt-1" style={{ height: SUB_PANEL_HEIGHT }}>{renderSubPanel()}</div>}
    </div>
  );
};
