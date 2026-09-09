import { useState, useEffect, useRef, type CSSProperties } from "react";
import {
  Menu, X, ArrowRight, MessageSquare, Users, Radio, TrendingUp,
  GraduationCap, Sparkles, ListChecks, Star, Bell, FolderKanban, Moon, GitCompare,
  Zap, BarChart3, ShieldCheck, Globe2,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
  Tooltip, XAxis, YAxis, BarChart, Bar,
  Sankey, Layer, Rectangle, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import { ContinuaMark } from "@/components/shared/ContinuaMark";
import { AfricaMap } from "@/components/shared/AfricaMap";
import { getStockName } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";

// ============================================================
// 1. REUSABLE ANIMATION COMPONENTS
// ============================================================

// Fade-in & slide-up on scroll
const Reveal = ({
  children,
  delay = 0,
  direction = "up",
  className = "",
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down";
  className?: string;
  style?: CSSProperties;
}) => {
  const variants = {
    hidden: { opacity: 0, y: direction === "up" ? 40 : -40 },
    visible: { opacity: 1, y: 0 },
  };
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay }}
      variants={variants}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

// Staggered children
const StaggerContainer = ({ children, className = "" }) => (
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-50px" }}
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.07 },
      },
    }}
    className={className}
  >
    {children}
  </motion.div>
);

const StaggerItem = ({ children, className = "" }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 25 },
      visible: { opacity: 1, y: 0 },
    }}
    transition={{ duration: 0.4 }}
    className={className}
  >
    {children}
  </motion.div>
);

// Mounts its children only once scrolled into view, so Recharts' own
// mount-time animation plays as the chart enters the viewport, not on page load.
const AnimateChartOnView = ({
  children,
  height = "100%",
}: {
  children: React.ReactNode;
  height?: number | string;
}) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {inView ? children : null}
    </div>
  );
};

// A small decorative price line that draws itself in (like a chart building
// up) the moment it scrolls into view, instead of appearing fully-formed.
const QuoteSpark = ({
  points,
  viewBox,
  stroke = "#25935F",
  strokeWidth = 2.5,
}: {
  points: string;
  viewBox: string;
  stroke?: string;
  strokeWidth?: number;
}) => (
  <svg viewBox={viewBox} preserveAspectRatio="none">
    <motion.polyline
      points={points}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 1.4, ease: "easeOut" }}
    />
  </svg>
);

// Count-up animation for numbers
const CountUp = ({ target, suffix = "", prefix = "", duration = 2000 }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!isInView) return;
    let startTime;
    const startValue = 0;
    const updateCount = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const current = Math.floor(progress * target);
      setCount(current);
      if (progress < 1) {
        requestAnimationFrame(updateCount);
      } else {
        setCount(target);
      }
    };
    requestAnimationFrame(updateCount);
  }, [isInView, target, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
};

// Mounts its children only once scrolled into view, so charts "grow"
// in fresh right when they enter the viewport rather than animating on load.
const ChartInView = ({
  children,
  height = "100%",
}: {
  children: (inView: boolean) => React.ReactNode;
  height?: string | number;
}) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {children(inView)}
    </div>
  );
};

// An SVG line that draws itself left-to-right the moment it scrolls into view
const DrawnLine = ({ points, stroke, viewBox }: { points: string; stroke: string; viewBox: string }) => (
  <motion.polyline
    points={points}
    fill="none"
    stroke={stroke}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    initial={{ pathLength: 0 }}
    whileInView={{ pathLength: 1 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 1.4, ease: "easeOut" }}
  />
);

// A little live-market pulse — a dot that breathes, for anywhere the page
// wants to say "this updates" without literally streaming a socket.
const LivePulse = ({ color = "var(--bull)" }: { color?: string }) => (
  <span className="live-pulse-wrap">
    <motion.span
      className="live-pulse-ring"
      style={{ borderColor: color }}
      animate={{ scale: [1, 2.1], opacity: [0.55, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
    />
    <span className="live-pulse-dot" style={{ background: color }} />
  </span>
);

// A live-updating price series — a small random-walk generator that keeps
// nudging the last point and scrolling the window forward, so a chart fed
// by this actually ticks for as long as it's on screen, not just once.
function useLiveSeries(seed: number[], stepMs = 900) {
  const [data, setData] = useState(() => seed.map((v, i) => ({ i, v })));
  useEffect(() => {
    const id = window.setInterval(() => {
      setData(prev => {
        const last = prev[prev.length - 1].v;
        const next = Math.max(2, last + (Math.random() - 0.47) * Math.max(0.6, last * 0.02));
        return [...prev.slice(1).map((p, idx) => ({ i: idx, v: p.v })), { i: prev.length - 1, v: next }];
      });
    }, stepMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepMs]);
  return data;
}

// A genuinely live chart, not a one-time draw-in — ticks for as long as it's
// mounted, same "this updates" promise the LivePulse dot makes elsewhere.
const LiveTickingChart = ({ seed, height = 78 }: { seed: number[]; height?: number }) => {
  const data = useLiveSeries(seed);
  const up = data[data.length - 1].v >= data[0].v;
  const color = up ? "var(--bull)" : "var(--bear)";
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2.25} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Leader-line label for the demo donut — same "elbow line + ticker + %"
// treatment used on the real Diversification Across Holdings chart.
const RADIAN = Math.PI / 180;
function renderDemoDonutLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, index, payload } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 14) * cos;
  const my = cy + (outerRadius + 14) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 10;
  const ey = my;
  const anchor = cos >= 0 ? "start" : "end";
  return (
    <g key={`demo-donut-label-${index}`}>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={payload.color} strokeOpacity={0.5} fill="none" />
      <text x={ex + (cos >= 0 ? 3 : -3)} y={ey - 2} textAnchor={anchor} fontSize={10} fontWeight={700} fill={payload.color} fontFamily="'IBM Plex Mono',monospace">
        {payload.symbol}
      </text>
      <text x={ex + (cos >= 0 ? 3 : -3)} y={ey + 9} textAnchor={anchor} fontSize={9.5} fill="var(--muted)" fontFamily="'IBM Plex Mono',monospace">
        {payload.pct.toFixed(1)}%
      </text>
    </g>
  );
}

// Same "flow" node shape used in the real Sankey — a solid bar for the
// portfolio root, thin markers everywhere downstream, one flow color.
function DemoSankeyNode({ x, y, width, height, index, payload }: any) {
  const isRoot = index === 0;
  const isSector = index > 0 && index <= SANKEY_SECTORS.length;
  const barWidth = isRoot ? width : 2;
  const barX = isRoot ? x : x + (width - barWidth) / 2;
  const fill = isRoot ? "var(--fg)" : "#E0A639";
  const labelSide = x < 40 ? "start" : "end";
  return (
    <Layer>
      <Rectangle x={barX} y={y} width={barWidth} height={Math.max(height, 2)} fill={fill} radius={1} />
      <text
        x={labelSide === "start" ? x - 7 : x + width + 7}
        y={y + height / 2}
        textAnchor={labelSide === "start" ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={9.5}
        fontWeight={isRoot ? 700 : 600}
        fill="var(--fg)"
        fontFamily="'IBM Plex Mono',monospace"
      >
        {payload.name}
        {isSector && <tspan fill="var(--muted)" fontWeight={400}> {payload.value.toFixed(0)}%</tspan>}
      </text>
    </Layer>
  );
}

// The Holdings donut demo — tap a slice and the center readout updates,
// exactly like the real Diversification Across Holdings tool, including
// the real tool's honest "n/a" for history that isn't on file yet.
const DiversificationDonutDemo = () => {
  const [selected, setSelected] = useState(DIVERSIFY_HOLDINGS[0]);
  return (
    <div className="tool-card">
      <div className="tool-card-head">
        <h5>Diversification across Holdings</h5>
        <p>Tap any slice — every holding gets its own label, none get bucketed away.</p>
      </div>
      <div className="donut-demo-wrap">
        <AnimateChartOnView height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={DIVERSIFY_HOLDINGS}
                dataKey="pct"
                nameKey="symbol"
                innerRadius="52%"
                outerRadius="74%"
                paddingAngle={1.5}
                stroke="none"
                isAnimationActive
                animationDuration={1100}
                label={renderDemoDonutLabel}
                labelLine={false}
              >
                {DIVERSIFY_HOLDINGS.map(h => (
                  <Cell
                    key={h.symbol}
                    fill={h.color}
                    stroke={selected.symbol === h.symbol ? "var(--card)" : "none"}
                    strokeWidth={selected.symbol === h.symbol ? 2 : 0}
                    onClick={() => setSelected(h)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </AnimateChartOnView>
        <div className="donut-demo-center">
          <span className="mono" style={{ color: selected.color, fontWeight: 700, fontSize: "12.5px" }}>{selected.symbol}</span>
          <span style={{ fontWeight: 700, fontSize: "15px" }}>{selected.pct.toFixed(1)}%</span>
          <div className="donut-demo-rows">
            <div><span>Value</span><b className="mono">KSh{selected.value.toLocaleString()}</b></div>
            <div><span>1Y</span><b className="mono">{selected.oneYear ?? "n/a"}</b></div>
            <div><span>7D</span><b className="mono" style={{ color: selected.sevenDay?.startsWith("-") ? "var(--bear)" : selected.sevenDay ? "var(--bull)" : undefined }}>{selected.sevenDay ?? "n/a"}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// The Sector Sankey demo — Portfolio flowing into Sector flowing into
// each Holding, one flow color, same as the real "Diversification across
// Industries" tool.
const DiversificationSankeyDemo = () => (
  <div className="tool-card">
    <div className="tool-card-head">
      <h5>Diversification across Industries</h5>
      <p>How your value actually flows — from portfolio, into sector, into each ticker.</p>
    </div>
    <div style={{ height: 220 }}>
      <AnimateChartOnView height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyDemoData}
            nodeWidth={2}
            nodePadding={14}
            margin={{ top: 8, right: 74, bottom: 8, left: 8 }}
            link={{ stroke: "#E0A639", strokeOpacity: 0.35 }}
            node={DemoSankeyNode}
          />
        </ResponsiveContainer>
      </AnimateChartOnView>
    </div>
  </div>
);

// The Portfolio Snowflake demo — one radar shape scoring value, growth,
// diversity, stability, winners and size at a glance.
const SnowflakeDemo = () => (
  <div className="tool-card">
    <div className="tool-card-head">
      <h5>Portfolio Snowflake</h5>
      <p>Six angles on portfolio health, in one shape — the same idea Simply Wall St popularised, tuned for the NSE.</p>
    </div>
    <div style={{ height: 220 }}>
      <AnimateChartOnView height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={SNOWFLAKE_AXES} outerRadius="72%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9.5, fill: "var(--muted)", fontFamily: "'IBM Plex Mono',monospace" }} />
            <Radar dataKey="v" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} isAnimationActive animationDuration={1100} />
          </RadarChart>
        </ResponsiveContainer>
      </AnimateChartOnView>
    </div>
  </div>
);

// The stock report's Risk pentagon — the same shape draws whether every
// factor is known or not; an unscored axis reads as unknown, never as a
// disguised "medium".
const RiskPentagonDemo = () => (
  <div className="tool-card">
    <div className="tool-card-head">
      <h5>Risk, scored honestly</h5>
      <p>One factor here has no data on file — the shape still draws, it just says so instead of guessing.</p>
    </div>
    <div style={{ height: 220 }}>
      <AnimateChartOnView height={220}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={RISK_AXES} outerRadius="70%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={(props: any) => {
                const axis = RISK_AXES[props.index];
                return (
                  <text x={props.x} y={props.y} textAnchor={props.textAnchor} fontSize={9.5} fill={axis.known ? "var(--muted)" : "var(--accent)"} fontFamily="'IBM Plex Mono',monospace">
                    {props.payload.value}{!axis.known ? " ·  ?" : ""}
                  </text>
                );
              }}
            />
            <Radar dataKey="v" stroke="var(--bear)" fill="var(--bear)" fillOpacity={0.28} isAnimationActive animationDuration={1100} />
          </RadarChart>
        </ResponsiveContainer>
      </AnimateChartOnView>
    </div>
  </div>
);

// The TradersHub reaction tray — six quick reactions in one row, a "+" that
// expands to the full set, no labels cluttering the emoji itself, same as
// the real in-app picker. Fully interactive: tap it.
const ReactionTrayDemo = () => {
  const [counts, setCounts] = useState([18, 2, 9, 6, 4, 0]);
  const [selected, setSelected] = useState<number | null>(0);
  const [expanded, setExpanded] = useState(false);
  const [pop, setPop] = useState<number | null>(null);

  const pick = (i: number) => {
    setCounts(prev => prev.map((c, idx) => {
      if (idx === i) return selected === i ? c - 1 : c + 1;
      if (idx === selected) return c - 1;
      return c;
    }));
    setSelected(selected === i ? null : i);
    setPop(i);
    window.setTimeout(() => setPop(null), 260);
  };

  return (
    <div className="reaction-demo">
      <div className="reaction-row">
        {LANDING_REACTIONS.map((r, i) => (
          <button key={r.label} type="button" title={r.label} className={`reaction-chip${selected === i ? " on" : ""}`} onClick={() => pick(i)}>
            <motion.span animate={pop === i ? { scale: [1, 1.5, 1] } : {}} transition={{ duration: 0.26 }} style={{ display: "inline-block" }}>
              {r.emoji}
            </motion.span>
            {counts[i] > 0 && <b>{counts[i]}</b>}
          </button>
        ))}
        <button type="button" aria-label="More reactions" className={`reaction-chip reaction-more${expanded ? " on" : ""}`} onClick={() => setExpanded(v => !v)}>+</button>
      </div>
      {expanded && (
        <motion.div className="reaction-expand" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.22 }}>
          {LANDING_REACTIONS_MORE.map(e => <span key={e} className="reaction-expand-item">{e}</span>)}
        </motion.div>
      )}
    </div>
  );
};

// ============================================================
// 2. TICKER DATA — symbol selection is curated, price/change come from
//    the canonical data (lib/stockPrices.ts -> data/nseSecurities.ts)
// ============================================================

const TICKER_WATCHLIST = ["SCOM", "EQTY", "KCB", "SCBK", "COOP", "EABL", "ABSA", "NCBA", "PORT", "BRIT", "KPLC", "BAT", "JUB", "DTK", "SBIC"] as const;

const tickerSymbols = TICKER_WATCHLIST;

const BOARD_WATCHLIST = ["SCOM", "EQTY", "KCB", "EABL", "COOP"] as const;

const researchModules = [
  { code: "R.01", title: "Valuation & performance", body: "Fair value estimates, valuation multiples against the sector, analyst price targets and how the stock has actually performed against a benchmark." },
  { code: "R.02", title: "Growth & health", body: "Revenue and earnings trends, margins, cash flow, debt load and share dilution — the fundamentals that hold up a price move." },
  { code: "R.03", title: "Ownership & insider activity", body: "See who holds the stock — institutions and insiders — and whether they've been buying or selling recently." },
  { code: "R.04", title: "Sector heatmap & screener", body: "Scan the whole board by sector performance, or filter every listed company down by the exact criteria that matter to you." },
  { code: "R.05", title: "Compare stocks side by side", body: "Line up two or three companies on the same metrics before deciding which one earns a place in your portfolio." },
  { code: "R.06", title: "AI-generated investment thesis", body: "Get a plain-language read on a stock — the bull case, the bear case, and what to watch — generated fresh from its current numbers." },
  { code: "R.07", title: "Chart indicators, your way", body: "Turn on moving averages, EMA, Bollinger Bands, MACD or RSI — or keep the chart clean. Switch chart types anytime, even in fullscreen." },
  { code: "R.08", title: "Price alerts, on your terms", body: "Set a target above or below the current price. Edit it, duplicate it, or add another for the same stock — you're in control." },
];

const trustItems = [
  { code: "S.01", title: "Row-level data security", body: "Your portfolio, watchlist and posts are protected at the database level — not just hidden in the app's interface." },
  { code: "S.02", title: "You control your privacy", body: "Choose whether your portfolio is visible to others, mute or block any account, and report anything that shouldn't be there." },
  { code: "S.03", title: "Real-time where it counts", body: "Price alerts are checked continuously, so you hear about a target the moment it's hit — not sometime after." },
];

const sectorAllocation = [
  { label: "Banking", value: 38, color: "var(--primary)" },
  { label: "Telecom", value: 24, color: "var(--accent)" },
  { label: "Manufacturing", value: 16, color: "var(--bull)" },
  { label: "Energy", value: 12, color: "var(--primary-dark)" },
  { label: "Insurance", value: 10, color: "var(--bear)" },
];

const assetAllocation = [
  { label: "Equities", value: 82, color: "var(--primary)" },
  { label: "Cash", value: 18, color: "var(--border)" },
];

// ---- Diversification showcase (Holdings donut / Sector Sankey / Snowflake) ----
// Mirrors the actual in-app portfolio tools, with illustrative sample numbers.
const DIVERSIFY_HOLDINGS = [
  { symbol: "KCB", sector: "Banking", pct: 22.7, value: 63650, color: "#E0498A", oneYear: "+18.4%", sevenDay: "+1.2%" },
  { symbol: "CGEN", sector: "Manufacturing", pct: 22.7, value: 63650, color: "#22C3A6", oneYear: "n/a", sevenDay: "-0.7%" },
  { symbol: "EQTY", sector: "Banking", pct: 19.3, value: 54110, color: "#8B6FE8", oneYear: "+9.6%", sevenDay: "+0.4%" },
  { symbol: "KAPC", sector: "Agriculture", pct: 13.2, value: 37060, color: "#5C7CFA", oneYear: "+31.2%", sevenDay: "+2.1%" },
  { symbol: "EABL", sector: "Manufacturing", pct: 10.0, value: 28050, color: "#F1584B", oneYear: "-4.8%", sevenDay: "-1.5%" },
  { symbol: "BRIT", sector: "Insurance", pct: 3.8, value: 10660, color: "#2FBFA0", oneYear: "n/a", sevenDay: "n/a" },
];

const SANKEY_SECTORS = [...new Set(DIVERSIFY_HOLDINGS.map(h => h.sector))];
const sankeyDemoData = {
  nodes: [{ name: "Portfolio" }, ...SANKEY_SECTORS.map(s => ({ name: s })), ...DIVERSIFY_HOLDINGS.map(h => ({ name: h.symbol }))],
  links: [
    ...SANKEY_SECTORS.map(s => ({
      source: 0,
      target: 1 + SANKEY_SECTORS.indexOf(s),
      value: DIVERSIFY_HOLDINGS.filter(h => h.sector === s).reduce((sum, h) => sum + h.pct, 0),
    })),
    ...DIVERSIFY_HOLDINGS.map((h, i) => ({ source: 1 + SANKEY_SECTORS.indexOf(h.sector), target: 1 + SANKEY_SECTORS.length + i, value: h.pct })),
  ],
};

const SNOWFLAKE_AXES = [
  { metric: "Value", v: 72 }, { metric: "Growth", v: 58 }, { metric: "Diversity", v: 64 },
  { metric: "Stability", v: 80 }, { metric: "Winners", v: 66 }, { metric: "Size", v: 45 },
];

// Risk pentagon — one axis is deliberately shown as "Unknown", the same way
// the real stock report treats a factor with no data on file: the shape
// still draws, it just doesn't pretend to know what it doesn't.
const RISK_AXES = [
  { metric: "Volatility", v: 62, known: true },
  { metric: "Debt", v: 38, known: true },
  { metric: "Liquidity", v: 74, known: true },
  { metric: "Governance", v: 0, known: false },
  { metric: "Concentration", v: 55, known: true },
];

const LANDING_REACTIONS: { emoji: string; label: string }[] = [
  { emoji: "📈", label: "Bullish" },
  { emoji: "📉", label: "Bearish" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "👎", label: "Thumbs down" },
];
const LANDING_REACTIONS_MORE = ["🤝", "💡", "👀", "😂", "🎉", "🏆", "💔", "😱", "🤔", "🙈", "🙏", "🤯", "😎", "🦈"];

const navSections = [
  { id: "highlights", label: "Highlights" },
  { id: "tradershub", label: "TradersHub" },
  { id: "research", label: "Research" },
  { id: "stock-page", label: "Stock page" },
  { id: "portfolio", label: "Portfolio" },
  { id: "tools", label: "Tools" },
  { id: "brand-story", label: "Our story" },
  { id: "more-features", label: "More" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
];

const HEADER_HEIGHT = 80;

const thMiniFeatures = [
  { icon: MessageSquare, title: "Threaded posts", body: "Tag a ticker, share your take, and reply in nested threads." },
  { icon: Radio, title: "Community Rooms", body: "Live and scheduled rooms for deeper, focused discussion." },
  { icon: TrendingUp, title: "Discover feed", body: "See trending posts, tickers and voices across the market." },
  { icon: Users, title: "Follow investors", body: "Build a feed of the takes you actually want to see." },
];

const moreFeatures = [
  { icon: GraduationCap, title: "Learn", body: "Bite-sized courses on investing basics, the NSE and reading the numbers — with badges and streaks as you go." },
  { icon: Sparkles, title: "Investment Themes", body: "Curated groups of NSE stocks built around a theme, like banking majors or export-driven earners." },
  { icon: Star, title: "Featured lists", body: "Ready-made lists — blue-chip, high-dividend, undervalued — to jump-start your research." },
  { icon: ListChecks, title: "Stock screener", body: "Filter every listed company by sector, valuation, dividend yield and more, down to exactly what matters to you." },
  { icon: FolderKanban, title: "Watchlist folders", body: "Organise the stocks you're tracking into folders that make sense for how you invest." },
  { icon: Bell, title: "Notifications centre", body: "Every price alert, reply and reaction lands in one place, so nothing gets missed." },
  { icon: GitCompare, title: "Compare view", body: "Line up any two or three NSE stocks side by side on the same set of metrics." },
  { icon: Moon, title: "Light, dark & AMOLED", body: "Three themes to choose from, including a true-black AMOLED mode that's easy on the battery." },
];

const overviewPillars = [
  { icon: ListChecks, title: "Deep research", body: "Every NSE-listed company broken into 8 research modules — valuation, growth, ownership and more — the same lenses an analyst would use." },
  { icon: Users, title: "TradersHub community", body: "A live feed built only around Kenyan markets, where investors post theses, react, and reply in threaded discussion." },
  { icon: FolderKanban, title: "Portfolio & watchlist", body: "Track what you own in shillings, see your sector and asset allocation, and keep watch on stocks you're circling." },
  { icon: Sparkles, title: "Alerts & AI thesis", body: "Set price alerts on your own terms, and get an AI-generated bull case and bear case, refreshed from a stock's current numbers." },
];

const highlightItems = [
  { tag: "NEW", icon: Sparkles, title: "AI Investment Thesis", body: "A fresh bull case and bear case for any NSE stock, written in plain language from its current numbers.", from: "#6C4FE0", to: "#9B7FEF" },
  { tag: "UPDATED", icon: ListChecks, title: "Chart Indicators", body: "SMA, EMA, Bollinger Bands, MACD and RSI overlays — now available in fullscreen too.", from: "#FF7A45", to: "#FFAE8A" },
  { tag: "NEW", icon: Radio, title: "TradersHub Rooms", body: "Live and scheduled rooms for focused discussion on the tickers you actually hold.", from: "#25935F", to: "#6FC79A" },
  { tag: "NEW", icon: GitCompare, title: "Compare View", body: "Line up two or three NSE stocks side by side, on the same set of metrics.", from: "#5638C4", to: "#8B6FE8" },
  { tag: "UPDATED", icon: Moon, title: "AMOLED Theme", body: "A true-black theme option that's easy on the battery and easy on the eyes at night.", from: "#16181D", to: "#4A4E5A" },
  { tag: "NEW", icon: Bell, title: "Smarter Alerts", body: "Duplicate, edit or stack alerts on the same stock — all of them checked in real time.", from: "#DB3024", to: "#F19686" },
];

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"></path></svg>
);

// ============================================================
// 3. MAIN COMPONENT
// ============================================================

const ContinuaLandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  // Real live quotes for the marketing ticker tape / exchange board — a
  // symbol with no live quote yet is simply omitted rather than shown with
  // a fabricated price, even on the public marketing page.
  const { quotes: tickerQuotes } = useLiveQuotes([...tickerSymbols]);
  type TickerRow = { symbol: string; price: number; change: number };
  const tickerRows: TickerRow[] = [];
  for (const symbol of tickerSymbols) {
    const q = tickerQuotes[symbol];
    if (q) tickerRows.push({ symbol, price: q.lastPrice, change: +q.changePercent.toFixed(1) });
  }
  const tickerItems = [...tickerRows, ...tickerRows];

  type BoardRow = readonly [string, string, number, number];
  const boardRows: BoardRow[] = [];
  for (const symbol of BOARD_WATCHLIST) {
    const q = tickerQuotes[symbol];
    if (q) boardRows.push([symbol, getStockName(symbol), q.lastPrice, +q.changePercent.toFixed(1)]);
  }

  // Cycles a soft highlight through the hero exchange board, one row every
  // couple of seconds — a lightweight stand-in for "a tick just landed"
  // without needing an actual live feed on the marketing page.
  const [flashRow, setFlashRow] = useState(0);
  useEffect(() => {
    if (boardRows.length === 0) return;
    const id = window.setInterval(() => setFlashRow(i => (i + 1) % boardRows.length), 2200);
    return () => window.clearInterval(id);
  }, [boardRows.length]);

  // ----- Recharts data -----
  const portfolioLineData = [
    { day: "Mon", value: 120000 },
    { day: "Tue", value: 135000 },
    { day: "Wed", value: 128000 },
    { day: "Thu", value: 150000 },
    { day: "Fri", value: 168000 },
    { day: "Sat", value: 176000 },
    { day: "Sun", value: 184650 },
  ];

  // For donut charts we need to convert color strings from CSS variables to actual hex values.
  // We'll use the raw CSS variable names; Recharts will interpret them as valid CSS (they are).
  // Alternatively, we can map to actual hex values but the current styling uses CSS vars.
  // We'll pass the color strings as they are.

  const sectorData = sectorAllocation.map(d => ({ name: d.label, value: d.value, fill: d.color }));
  const assetData = assetAllocation.map(d => ({ name: d.label, value: d.value, fill: d.color }));

  // Helper to get the real CSS variable value for charts (not needed, Recharts accepts CSS vars)
  // We'll use the string directly.

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT - 12;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setMenuOpen(false);
  };

  return (
    <>
      <style>{`
        /* ===== YOUR EXACT EXISTING STYLES (unchanged) ===== */
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        :root{
          --bg:#F9F8F6; --bg-alt:#F2F0EE; --card:#ffffff; --border:#E4E1DD;
          --fg:#16181D; --muted:#6C727F;
          --primary:#6C4FE0; --primary-dark:#5638C4; --primary-tint:#F0ECFC;
          --accent:#FF7A45; --accent-tint:#FFEDE3;
          --bull:#25935F; --bear:#DB3024; --bear-tint:#FCEAE8;
          --radius:10px;
          --shadow: 0 1px 2px rgba(20,20,20,.04), 0 8px 24px -12px rgba(20,20,20,.12);
        }
        *{box-sizing:border-box;}
        html, body, #root{ margin:0; padding:0; scroll-behavior:smooth; }
        body{
          background:var(--bg); color:var(--fg);
          font-family:'Inter',system-ui,-apple-system,sans-serif;
          -webkit-font-smoothing:antialiased;
        }
        a{ color:inherit; text-decoration:none; }
        img{ max-width:100%; display:block; }
        .wrap{ max-width:1140px; margin:0 auto; padding:0 24px; }
        h1,h2,h3,.display{ font-family:'Space Grotesk',system-ui,sans-serif; letter-spacing:-0.01em; }
        .mono{ font-family:'IBM Plex Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }
        a:focus-visible, button:focus-visible, summary:focus-visible, input:focus-visible{
          outline:2px solid var(--primary); outline-offset:2px; border-radius:4px;
        }
        .btn{
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          height:42px; padding:0 20px; border-radius:12px; font-weight:600; font-size:13.5px;
          font-family:'Space Grotesk',sans-serif;
          border:1px solid transparent; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease, background .15s ease, filter .15s ease;
          white-space:nowrap;
        }
        .btn:active{ transform:scale(0.97); }
        .btn:hover{ transform:translateY(-1px); }
        .btn-primary{ background:linear-gradient(135deg, var(--primary), var(--accent)); color:#fff; box-shadow:0 6px 18px -6px rgba(108,79,224,.45); }
        .btn-primary:hover{ filter:brightness(1.06); box-shadow:0 10px 22px -6px rgba(108,79,224,.55); }
        .btn-ghost{ background:transparent; color:var(--fg); border-color:var(--border); }
        .btn-ghost:hover{ background:var(--bg-alt); }
        .btn-lg{ height:50px; padding:0 26px; font-size:15px; border-radius:14px; }
        .eyebrow{
          font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
          color:var(--primary); display:inline-flex; align-items:center; justify-content:center; gap:8px; margin-bottom:16px;
        }
        .eyebrow::before{ content:""; width:14px; height:1px; background:var(--primary); flex:none; }
        .ticker-strip{
          position:fixed; top:0; left:0; right:0; z-index:51; height:28px; margin:0;
          background:#101014; color:#fff; overflow:hidden; white-space:nowrap;
          border-bottom:1px solid rgba(255,255,255,.08);
        }
        .ticker-track{
          display:inline-flex; align-items:center; gap:32px; padding:8px 0;
          width:max-content;
          animation:scroll-left 34s linear infinite;
          will-change:transform;
        }
        .ticker-strip:hover .ticker-track{ animation-play-state:paused; }
        .tick{ display:inline-flex; align-items:center; gap:7px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; }
        .tick b{ font-weight:600; }
        .up{ color:#5fd39a; } .down{ color:#f19686; }
        @keyframes scroll-left{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
        header.nav{
          position:fixed; top:28px; left:0; right:0; z-index:50; margin:0; background:rgba(250,247,241,.9); backdrop-filter:blur(10px);
          border-bottom:1px solid var(--border);
        }
        .nav-inner{ display:flex; align-items:center; justify-content:space-between; height:52px; gap:10px; }
        .brand{ display:flex; align-items:center; gap:9px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:16px; letter-spacing:-.01em; flex:none; }
        .mark{ flex:none; }
        nav.links{ display:flex; align-items:center; gap:22px; }
        nav.links a{ font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); position:relative; padding-bottom:3px; }
        nav.links a::after{ content:""; position:absolute; left:0; right:100%; bottom:0; height:1px; background:var(--accent); transition:right .2s ease; }
        nav.links a:hover{ color:var(--fg); }
        nav.links a:hover::after{ right:0; }
        .nav-cta{ display:flex; align-items:center; gap:8px; flex:none; }
        .nav-cta .btn{ height:32px; padding:0 13px; font-size:11.5px; border-radius:10px; }
        .menu-btn{
          display:inline-flex; align-items:center; justify-content:center;
          width:32px; height:32px; border-radius:10px; border:1px solid var(--border); background:transparent; color:var(--fg);
          cursor:pointer; flex:none; transition:background .15s ease, transform .15s ease;
        }
        .menu-btn:active{ transform:scale(0.92); }
        .menu-btn:hover{ background:var(--bg-alt); }
        .drawer-overlay{
          position:fixed; inset:0; z-index:59; background:rgba(15,15,20,.45);
          opacity:0; pointer-events:none; transition:opacity .22s ease;
        }
        .drawer-overlay.open{ opacity:1; pointer-events:auto; }
        .drawer{
          position:fixed; top:0; right:0; bottom:0; z-index:60; width:min(82vw,320px);
          background:var(--card); box-shadow:-8px 0 30px -10px rgba(20,20,20,.25);
          transform:translateX(100%); transition:transform .25s ease;
          display:flex; flex-direction:column; padding:18px 20px; overflow-y:auto;
        }
        .drawer.open{ transform:translateX(0); }
        .drawer-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; padding-top:8px; }
        .drawer-head span{ font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
        .drawer nav{ display:flex; flex-direction:column; gap:2px; margin-bottom:20px; }
        .drawer nav a{
          font-family:'Space Grotesk',sans-serif; font-size:16px; font-weight:600; padding:12px 4px;
          border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;
        }
        .drawer nav a svg{ color:var(--muted); flex:none; }
        .drawer-actions{ display:flex; flex-direction:column; gap:10px; margin-top:auto; padding-top:16px; }
        .drawer-actions .btn{ width:100%; height:44px; font-size:14px; }
        .hero{ padding:4px 0 30px; }
        .hero-grid{ display:grid; grid-template-columns:1.05fr .95fr; gap:56px; align-items:center; }
        .hero h1{ font-size:47px; line-height:1.06; font-weight:700; margin:0 0 20px; }
        .hero h1 em{ font-style:normal; color:var(--primary); }
        .hero p.lead{ font-size:17px; line-height:1.6; color:var(--muted); max-width:480px; margin:0 0 30px; }
        .hero-actions{ display:flex; gap:12px; flex-wrap:wrap; margin-bottom:26px; }
        .hero-trust{ display:flex; align-items:center; gap:18px; font-size:12.5px; color:var(--muted); flex-wrap:wrap; }
        .hero-trust span{ display:flex; align-items:center; gap:6px; }
        .board{
          position:relative; background:var(--card); border:1px solid var(--border); border-radius:16px;
          box-shadow:var(--shadow); overflow:hidden;
        }
        .board-head{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--border); }
        .board-head .label{ font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
        .board-live{ display:inline-flex; align-items:center; gap:6px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--bull); }
        .board-live .dot{ width:6px; height:6px; border-radius:50%; background:var(--bull); animation:pulse 1.8s ease-in-out infinite; }
        @keyframes pulse{ 0%,100%{ opacity:1; } 50%{ opacity:.35; } }
        .board-cols{ display:grid; grid-template-columns:1.5fr .9fr .8fr; padding:9px 18px; font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); border-bottom:1px solid var(--border); }
        .board-row{ display:grid; grid-template-columns:1.5fr .9fr .8fr; align-items:center; padding:12px 18px; border-bottom:1px solid var(--border); transition:background .15s ease; }
        .board-row:hover{ background:var(--bg-alt); }
        .board-row:last-of-type{ border-bottom:none; }
        .board-sym{ font-weight:600; font-size:13px; }
        .board-name{ font-size:10.5px; color:var(--muted); margin-top:1px; }
        .board-price{ font-family:'IBM Plex Mono',monospace; font-size:13px; text-align:right; }
        .board-chg{ font-family:'IBM Plex Mono',monospace; font-size:12px; text-align:right; }
        .board-foot{ padding:10px 18px; font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--muted); background:var(--bg-alt); }
        .board-flag{
          position:absolute; top:16px; right:-10px; background:var(--fg); color:#fff; font-family:'IBM Plex Mono',monospace;
          font-size:10px; font-weight:600; letter-spacing:.05em; padding:5px 12px; border-radius:999px; box-shadow:var(--shadow);
        }
        section{ padding:80px 0; scroll-margin-top:${HEADER_HEIGHT + 16}px; }
        .section-head{ max-width:620px; margin-bottom:48px; }
        .section-head h2{ font-size:32px; font-weight:600; margin:0 0 14px; line-height:1.15; }
        .section-head p{ font-size:15.5px; color:var(--muted); line-height:1.6; margin:0; }
        .alt{ background:var(--bg-alt); }
        .stats{ display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
        .stat{ padding:26px 22px; text-align:center; border-right:1px solid var(--border); }
        .stat:last-child{ border-right:none; }
        .stat b{ display:block; font-family:'IBM Plex Mono',monospace; font-size:26px; font-weight:600; color:var(--primary); }
        .stat span{ font-size:11.5px; color:var(--muted); }
        .overview-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .overview-card{
          background:var(--card); border:1px solid var(--border); border-radius:16px; padding:24px 22px;
          transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }
        .overview-card:hover{ transform:translateY(-4px); box-shadow:var(--shadow); border-color:var(--primary); }
        .overview-card .oc-icon{
          width:38px; height:38px; border-radius:10px; background:var(--primary-tint); color:var(--primary);
          display:inline-flex; align-items:center; justify-content:center; margin-bottom:14px; transition:transform .2s ease;
        }
        .overview-card:hover .oc-icon{ transform:scale(1.08) rotate(-4deg); }
        .overview-card h4{ font-size:15px; font-weight:600; margin:0 0 8px; font-family:'Space Grotesk',sans-serif; }
        .overview-card p{ font-size:13px; color:var(--muted); line-height:1.6; margin:0; }
        .highlights-viewport{
          overflow:hidden; position:relative; margin:0 -24px; padding:4px 24px;
          -webkit-mask-image:linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent);
          mask-image:linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent);
        }
        .highlights-track{
          display:flex; gap:20px; width:max-content; padding:6px 0;
          animation:scroll-left 42s linear infinite;
        }
        .highlights-viewport:hover .highlights-track{ animation-play-state:paused; }
        .highlight-card{
          flex:0 0 272px; background:var(--card); border:1px solid var(--border); border-radius:16px;
          overflow:hidden; box-shadow:var(--shadow); transition:transform .2s ease, box-shadow .2s ease;
        }
        .highlight-card:hover{ transform:translateY(-5px); box-shadow:0 1px 2px rgba(20,20,20,.04), 0 20px 36px -16px rgba(20,20,20,.22); }
        .highlight-media{
          height:132px; position:relative; display:flex; align-items:center; justify-content:center;
          overflow:hidden;
        }
        .highlight-media .hm-icon{
          width:52px; height:52px; border-radius:14px; background:rgba(255,255,255,.22); backdrop-filter:blur(2px);
          display:inline-flex; align-items:center; justify-content:center; color:#fff; position:relative; z-index:1;
        }
        .highlight-media .hm-lines{ position:absolute; inset:14px auto auto 14px; display:flex; flex-direction:column; gap:5px; opacity:.5; }
        .highlight-media .hm-lines span{ display:block; height:5px; border-radius:3px; background:#fff; }
        .highlight-tag{
          position:absolute; top:12px; right:12px; font-family:'IBM Plex Mono',monospace; font-size:9.5px; font-weight:700;
          letter-spacing:.08em; color:#fff; background:rgba(0,0,0,.28); padding:3px 8px; border-radius:999px; z-index:1;
        }
        .highlight-body{ padding:16px 18px 20px; }
        .highlight-body h4{ font-size:14px; font-weight:600; margin:0 0 6px; font-family:'Space Grotesk',sans-serif; }
        .highlight-body p{ font-size:12.5px; color:var(--muted); line-height:1.55; margin:0; }
        .module-list{ display:grid; grid-template-columns:1fr 1fr; column-gap:40px; }
        .module-row{ position:relative; display:flex; gap:16px; padding:20px 0 20px 16px; border-bottom:1px solid var(--border); transition:transform .18s ease; }
        .module-row::before{ content:""; position:absolute; left:0; top:20px; bottom:20px; width:2px; background:transparent; transition:background .18s ease; }
        .module-row:hover{ transform:translateX(4px); }
        .module-row:hover::before{ background:var(--accent); }
        .module-code{ font-family:'IBM Plex Mono',monospace; font-size:11.5px; font-weight:600; color:var(--muted); padding-top:2px; flex:none; width:34px; transition:color .18s ease; }
        .module-row:hover .module-code{ color:var(--primary); }
        .module-row h3{ font-size:15.5px; font-weight:600; margin:0 0 6px; }
        .module-row p{ font-size:13.5px; color:var(--muted); line-height:1.55; margin:0; }
        .showcase{ display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:center; }
        .showcase.reverse .showcase-media{ order:2; }
        .showcase.reverse .showcase-copy{ order:1; }
        .showcase + .showcase{ margin-top:0; }
        .showcase-copy h3{ font-size:25px; font-weight:600; margin:0 0 14px; line-height:1.22; }
        .showcase-copy p{ font-size:14.5px; color:var(--muted); line-height:1.65; margin:0 0 20px; }
        .check-list{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
        .check-list li{ display:flex; align-items:flex-start; gap:10px; font-size:13.5px; color:var(--fg); }
        .check-list svg{ flex:none; margin-top:2px; color:var(--primary); }
        .media-card{ background:var(--card); border:1px solid var(--border); border-radius:14px; padding:22px; box-shadow:var(--shadow); transition:transform .25s ease, box-shadow .25s ease; }
        .media-card:hover{ transform:translateY(-4px); box-shadow:0 1px 2px rgba(20,20,20,.04), 0 20px 36px -16px rgba(20,20,20,.18); }
        .media-card + .media-card{ margin-top:16px; }
        .post-row{ display:flex; align-items:center; gap:8px; margin-bottom:12px; }
        .post-avatar{ width:26px; height:26px; border-radius:50%; background:linear-gradient(155deg,var(--primary),var(--accent)); flex:none; }
        .post-name{ font-size:13px; font-weight:600; }
        .post-handle{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--muted); font-weight:400; }
        .post-line{ height:7px; border-radius:3px; background:var(--bg-alt); margin-bottom:7px; }
        .react-demo{ display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .react-pill{ display:flex; align-items:center; gap:6px; background:var(--bg-alt); border-radius:999px; padding:6px 12px; font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; transition:transform .15s ease; }
        .react-pill:hover{ transform:translateY(-2px); }
        .react-pill.on{ background:var(--primary-tint); color:var(--primary-dark); }
        .reply-preview{ margin-top:14px; padding-left:14px; border-left:1px solid rgba(22,24,29,.12); }
        .pf-value-label{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:5px; }
        .pf-value{ font-family:'IBM Plex Mono',monospace; font-size:24px; font-weight:600; }
        .pf-chip{ font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; color:var(--bull); background:#EAF6F0; padding:4px 10px; border-radius:999px; }
        .pf-chart{ height:96px; margin-top:14px; border-radius:8px; background:var(--primary-tint); position:relative; overflow:hidden; }
        .pf-chart svg{ position:absolute; inset:0; }
        .quote-chart{ height:64px; margin-top:10px; border-radius:8px; background:var(--primary-tint); position:relative; overflow:hidden; }
        .quote-chart svg{ position:absolute; inset:0; }
        .donut-title{ font-size:10.5px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px; }
        .donut-row{ display:flex; gap:28px; flex-wrap:wrap; }
        .donut-wrap{ display:flex; align-items:center; gap:14px; }
        .donut{ position:relative; width:96px; height:96px; border-radius:50%; flex:none; }
        .donut-hole{ position:absolute; inset:20px; background:var(--card); border-radius:50%; }
        .donut-legend{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
        .donut-legend li{ display:flex; align-items:center; gap:7px; font-size:12px; color:var(--muted); }
        .donut-legend .dot{ width:8px; height:8px; border-radius:50%; flex:none; }
        .donut-legend b{ margin-left:10px; font-family:'IBM Plex Mono',monospace; color:var(--fg); font-size:11.5px; font-weight:600; }

        /* ---- Live pulse dot (used wherever the page wants to say "this updates") ---- */
        .live-pulse-wrap{ position:relative; display:inline-flex; width:8px; height:8px; flex:none; }
        .live-pulse-dot{ position:absolute; inset:0; border-radius:50%; }
        .live-pulse-ring{ position:absolute; inset:0; border-radius:50%; border:1.5px solid; }

        /* ---- Tools showcase grid (Donut / Sankey / Snowflake / Risk) ---- */
        .tools-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
        .tool-card{
          background:var(--card); border:1px solid var(--border); border-radius:16px; padding:18px;
          box-shadow:var(--shadow); transition:transform .25s ease, box-shadow .25s ease;
          transform-style:preserve-3d; will-change:transform;
        }
        .tool-card:hover{ transform:translateY(-5px); box-shadow:0 1px 2px rgba(20,20,20,.04), 0 22px 40px -18px rgba(20,20,20,.2); }
        .tool-card-head h5{ margin:0 0 4px; font-size:13.5px; font-weight:600; font-family:'Space Grotesk',sans-serif; }
        .tool-card-head p{ margin:0 0 6px; font-size:11.5px; color:var(--muted); line-height:1.5; }
        .donut-demo-wrap{ position:relative; }
        .donut-demo-center{
          position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:1px; pointer-events:none; text-align:center;
        }
        .donut-demo-rows{ margin-top:5px; display:flex; flex-direction:column; gap:1px; width:84px; }
        .donut-demo-rows div{ display:flex; align-items:center; justify-content:space-between; font-size:9px; line-height:1.5; }
        .donut-demo-rows span{ color:var(--muted); }
        .donut-demo-rows b{ font-weight:600; }

        /* ---- Reaction tray demo (TradersHub) ---- */
        .reaction-demo{ margin-top:16px; }
        .reaction-row{ display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
        .reaction-chip{
          display:flex; align-items:center; gap:4px; height:32px; padding:0 9px; border-radius:999px;
          background:var(--bg-alt); border:1px solid transparent; font-size:15px; cursor:pointer;
          transition:transform .15s ease, background .15s ease, border-color .15s ease;
        }
        .reaction-chip b{ font-family:'IBM Plex Mono',monospace; font-size:10.5px; font-weight:600; color:var(--muted); }
        .reaction-chip:hover{ transform:translateY(-2px); background:var(--border); }
        .reaction-chip.on{ background:var(--primary-tint); border-color:var(--primary); }
        .reaction-chip.reaction-more{ font-size:14px; font-weight:700; color:var(--muted); background:transparent; border:1px dashed var(--border); }
        .reaction-expand{ display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; overflow:hidden; }
        .reaction-expand-item{
          display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:999px;
          background:var(--bg-alt); font-size:14px;
        }

        /* ---- Ambient background blobs (hero) ---- */
        .hero{ position:relative; overflow:hidden; }
        .hero-blob{ position:absolute; border-radius:50%; filter:blur(60px); opacity:.35; z-index:0; pointer-events:none; }
        .hero-blob-1{ width:360px; height:360px; background:var(--primary); top:-120px; right:-60px; animation:blob-float-1 16s ease-in-out infinite; }
        .hero-blob-2{ width:280px; height:280px; background:var(--accent); bottom:-100px; left:-60px; animation:blob-float-2 18s ease-in-out infinite; }
        .hero .wrap{ position:relative; z-index:1; }
        @keyframes blob-float-1{ 0%,100%{ transform:translate(0,0) scale(1); } 50%{ transform:translate(-30px,30px) scale(1.08); } }
        @keyframes blob-float-2{ 0%,100%{ transform:translate(0,0) scale(1); } 50%{ transform:translate(24px,-24px) scale(1.1); } }

        /* ---- Board row flash — cycles through as if a fresh tick just landed ---- */
        .board-row{ transition:background-color .5s ease; }
        .board-row.flash{ background:var(--primary-tint); }
        @media (max-width:900px){
          .tools-grid{ grid-template-columns:1fr 1fr; }
        }
        @media (max-width:560px){
          .tools-grid{ grid-template-columns:1fr; }
        }
        .steps{ display:grid; grid-template-columns:repeat(3,1fr); gap:28px; }
        .step{ position:relative; padding-top:8px; transition:transform .2s ease; }
        .step:hover{ transform:translateY(-3px); }
        .step .num{ font-family:'IBM Plex Mono',monospace; font-size:22px; font-weight:600; color:var(--primary); display:block; margin-bottom:14px; }
        .step h3{ font-size:16.5px; font-weight:600; margin:0 0 8px; }
        .step p{ font-size:13.5px; color:var(--muted); line-height:1.6; margin:0; }
        .step-line{ position:absolute; top:16px; left:44px; right:-14px; height:1px; background:var(--border); }
        .th-spotlight{ padding-top:8px; }
        .th-spotlight-panel{
          background:linear-gradient(165deg, var(--primary-tint), var(--card) 55%);
          border:1px solid var(--border); border-radius:24px; padding:48px 44px;
          box-shadow:0 1px 2px rgba(20,20,20,.04), 0 24px 48px -28px rgba(108,79,224,.35);
        }
        .brand-story-section{ background:var(--bg); }
        .brand-story-panel{
          display:flex; flex-direction:column; align-items:center; text-align:center;
          padding:72px 0 64px; max-width:620px; margin:0 auto;
        }
        .brand-story-copy .eyebrow{ justify-content:center; color:#FF8A00; }
        .brand-story-copy .eyebrow::before{ background:#FF8A00; }
        .brand-story-copy h2{ color:var(--fg); }
        .brand-story-copy p{ color:var(--muted); font-size:15.5px; line-height:1.7; max-width:460px; margin-left:auto; margin-right:auto; }
        .brand-story-chips{ display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:26px; }
        .brand-story-chips span{
          display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600;
          color:var(--fg); background:var(--card); border:1px solid var(--border);
          border-radius:999px; padding:7px 13px;
        }
        .brand-story-chips svg{ color:var(--primary); }
        .brand-story-media{ position:relative; width:min(78vw, 380px); margin-bottom:40px; }
        @media (max-width:860px){
          .brand-story-panel{ padding:56px 0 48px; }
          .brand-story-media{ width:min(72vw, 300px); margin-bottom:32px; }
        }
        .th-eyebrow{ color:var(--accent); }
        .th-eyebrow::before{ background:var(--accent); }
        .th-mini-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:40px; padding-top:36px; border-top:1px solid var(--border); }
        .th-mini{ display:flex; gap:11px; align-items:flex-start; transition:transform .2s ease; }
        .th-mini:hover{ transform:translateY(-3px); }
        .th-mini svg{ color:var(--primary); flex:none; margin-top:2px; }
        .th-mini h5{ font-size:13px; font-weight:600; margin:0 0 3px; font-family:'Space Grotesk',sans-serif; }
        .th-mini p{ font-size:12px; color:var(--muted); line-height:1.5; margin:0; }
        .more-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--border); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
        .more-item{ background:var(--card); padding:22px 20px; transition:background .2s ease, transform .2s ease; position:relative; z-index:1; }
        .more-item:hover{ background:var(--primary-tint); transform:translateY(-2px); z-index:2; }
        .more-item svg{ color:var(--primary); margin-bottom:12px; transition:transform .2s ease; }
        .more-item:hover svg{ transform:scale(1.12); }
        .more-item h5{ font-size:13.5px; font-weight:600; margin:0 0 6px; font-family:'Space Grotesk',sans-serif; }
        .more-item p{ font-size:12px; color:var(--muted); line-height:1.55; margin:0; }
        .trust-grid{ display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
        .trust-col{ padding:28px 26px; border-right:1px solid var(--border); transition:background .2s ease; }
        .trust-col:hover{ background:var(--card); }
        .trust-col:last-child{ border-right:none; }
        .trust-col .module-code{ display:block; margin-bottom:10px; width:auto; }
        .trust-col h4{ font-size:15px; font-weight:600; margin:0 0 8px; font-family:'Space Grotesk',sans-serif; }
        .trust-col p{ font-size:13px; color:var(--muted); line-height:1.6; margin:0; }
        .cta-band{
          position:relative; background:linear-gradient(155deg, var(--primary-dark), var(--primary) 55%, var(--accent));
          border-radius:20px; padding:56px 48px; color:#fff; overflow:hidden;
          display:flex; align-items:center; justify-content:space-between; gap:32px;
        }
        .cta-tape{ position:absolute; inset:0; display:flex; align-items:center; opacity:.14; pointer-events:none; }
        .cta-tape span{ font-family:'IBM Plex Mono',monospace; font-size:13px; white-space:nowrap; animation:scroll-left 26s linear infinite; }
        .cta-band > *{ position:relative; }
        .cta-band h2{ font-size:27px; font-weight:600; margin:0 0 8px; }
        .cta-band p{ margin:0; opacity:.9; font-size:14.5px; max-width:420px; }
        .cta-band .btn-primary{ background:#fff; color:var(--primary-dark); box-shadow:none; }
        .cta-band .btn-primary:hover{ background:#f2f2f2; }
        .pricing-grid{ display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:760px; margin:0 auto; }
        .price-card{ background:var(--card); border:1px solid var(--border); border-radius:16px; padding:28px; transition:transform .2s ease, box-shadow .2s ease; }
        .price-card:hover{ transform:translateY(-4px); box-shadow:var(--shadow); }
        .price-card.premium{ border-color:transparent; background:linear-gradient(180deg, var(--primary-tint), var(--card) 42%); box-shadow:0 0 0 1.5px var(--primary); }
        .price-card.premium:hover{ box-shadow:0 0 0 1.5px var(--primary), var(--shadow); }
        .price-card .plan-name{ font-family:'IBM Plex Mono',monospace; font-size:11.5px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
        .price-card.premium .plan-name{ color:var(--primary); }
        .price-card .plan-price{ font-family:'IBM Plex Mono',monospace; font-size:32px; font-weight:600; margin:10px 0 2px; }
        .price-card .plan-period{ font-size:13px; color:var(--muted); font-weight:500; }
        .price-card ul{ list-style:none; padding:0; margin:20px 0 0; display:flex; flex-direction:column; gap:10px; }
        .price-card li{ display:flex; align-items:flex-start; gap:8px; font-size:13.5px; }
        .price-card li svg{ flex:none; margin-top:2px; color:var(--primary); }
        .price-card .btn{ width:100%; margin-top:22px; }
        .faq-item{ display:flex; gap:16px; border-bottom:1px solid var(--border); padding:22px 0; }
        .faq-code{ font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; color:var(--muted); padding-top:2px; flex:none; width:32px; }
        .faq-body{ flex:1; }
        .faq-item summary{ cursor:pointer; font-weight:600; font-size:14.5px; list-style:none; display:flex; justify-content:space-between; align-items:center; }
        .faq-item summary::-webkit-details-marker{ display:none; }
        .faq-item summary::after{ content:"+"; font-size:19px; color:var(--muted); font-weight:400; transition:transform .2s ease; }
        .faq-item[open] summary::after{ content:"–"; }
        .faq-item p{ margin:12px 0 0; font-size:13.5px; color:var(--muted); line-height:1.6; }
        footer{ border-top:1px solid var(--border); padding:52px 0 30px; }
        .foot-grid{ display:grid; grid-template-columns:1.4fr repeat(3,1fr); gap:32px; margin-bottom:40px; }
        .foot-grid h5{ font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 14px; }
        .foot-grid a{ display:block; font-size:13.5px; color:var(--fg); text-decoration:none; margin-bottom:10px; transition:color .15s ease, transform .15s ease; }
        .foot-grid a:hover{ color:var(--primary); transform:translateX(2px); }
        .foot-bottom{ display:flex; justify-content:space-between; align-items:center; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--muted); flex-wrap:wrap; gap:12px; }
        @media (max-width:900px){
          .hero-grid{ grid-template-columns:1fr; }
          .hero{ text-align:center; }
          .hero p.lead{ margin-left:auto; margin-right:auto; }
          .hero-actions,.hero-trust{ justify-content:center; }
          nav.links{ display:none; }
          .overview-grid{ grid-template-columns:1fr 1fr; }
          .module-list{ grid-template-columns:1fr; }
          .showcase, .showcase.reverse{ grid-template-columns:1fr; }
          .showcase.reverse .showcase-media, .showcase.reverse .showcase-copy{ order:initial; }
          .steps{ grid-template-columns:1fr; }
          .step-line{ display:none; }
          .stats{ grid-template-columns:1fr 1fr; }
          .stat:nth-child(2){ border-right:none; }
          .stat{ border-bottom:1px solid var(--border); }
          .trust-grid{ grid-template-columns:1fr; }
          .trust-col{ border-right:none; border-bottom:1px solid var(--border); }
          .trust-col:last-child{ border-bottom:none; }
          .pricing-grid{ grid-template-columns:1fr; }
          .cta-band{ flex-direction:column; text-align:center; padding:40px 26px; }
          .foot-grid{ grid-template-columns:1fr 1fr; }
          .donut-row{ justify-content:center; }
          .th-spotlight-panel{ padding:32px 22px; }
          .th-mini-grid{ grid-template-columns:1fr 1fr; }
          .more-grid{ grid-template-columns:1fr 1fr; }
        }
        @media (max-width:560px){
          .hero{ padding-top:0; }
          .hero h1{ font-size:32px; }
          .stats{ grid-template-columns:1fr 1fr; }
          .overview-grid{ grid-template-columns:1fr; }
          section{ padding:56px 0; }
          .board-cols, .board-row{ grid-template-columns:1.3fr .9fr .8fr; }
          .th-mini-grid{ grid-template-columns:1fr; }
          .more-grid{ grid-template-columns:1fr; }
        }
        @media (max-width:420px){
          .brand span:last-child{ display:none; }
          .nav-cta{ gap:6px; }
          .nav-cta .btn{ height:30px; padding:0 10px; font-size:10.5px; }
          .menu-btn{ width:30px; height:30px; }
        }
        @media (prefers-reduced-motion:reduce){
          .ticker-track, .cta-tape span, .board-live .dot, .highlights-track, .hero-blob-1, .hero-blob-2, .live-pulse-ring{ animation:none; }
        }
        @media (max-width:560px){
          .highlight-card{ flex-basis:230px; }
        }
      `}</style>

      {/* ============================================================
          TICKER & NAV (unchanged)
      ============================================================ */}
      <div className="ticker-strip" aria-hidden="true">
        <div className="ticker-track">
          {tickerItems.map((tick, index) => (
            <span className="tick" key={`${tick.symbol}-${index}`}>
              <b>{tick.symbol}</b> KES {tick.price.toFixed(2)} <span className={tick.change >= 0 ? "up" : "down"}>{tick.change >= 0 ? "▲" : "▼"} {Math.abs(tick.change).toFixed(1)}%</span>
            </span>
          ))}
        </div>
      </div>

      <header className="nav">
        <div className="wrap nav-inner">
          <div className="brand">
            <ContinuaMark size={30} bare className="mark" />
            <span>Continua</span>
          </div>
          <nav className="links" aria-label="Main navigation">
            {navSections.map((s) => (
              <a key={s.id} href={`#${s.id}`} onClick={scrollToSection(s.id)}>{s.label}</a>
            ))}
          </nav>
          <div className="nav-cta">
            <a href="/auth" className="btn btn-ghost">Log in</a>
            <a href="/auth?mode=signup" className="btn btn-primary">Get started</a>
            <button className="menu-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Menu size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className={`drawer-overlay ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden="true"></div>
      <aside className={`drawer ${menuOpen ? "open" : ""}`} aria-label="Site menu" aria-hidden={!menuOpen}>
        <div className="drawer-head">
          <span>Menu</span>
          <button className="menu-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <nav>
          {navSections.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={scrollToSection(s.id)}>
              {s.label}
              <ArrowRight size={15} />
            </a>
          ))}
        </nav>
        <div className="drawer-actions">
          <a href="/auth" className="btn btn-ghost">Log in</a>
          <a href="/auth?mode=signup" className="btn btn-primary">Get started</a>
        </div>
      </aside>

      <div style={{ height: `${HEADER_HEIGHT}px` }} aria-hidden="true"></div>

      {/* ============================================================
          HERO (wrapped with Reveal)
      ============================================================ */}
      <section className="hero">
        <div className="hero-blob hero-blob-1" aria-hidden="true" />
        <div className="hero-blob hero-blob-2" aria-hidden="true" />
        <div className="wrap hero-grid">
          <Reveal>
            <div>
              <div className="eyebrow">Built for the Nairobi Securities Exchange</div>
              <h1>Research it.<br />Track it.<br /><em>Talk it through.</em></h1>
              <p className="lead">Continua brings real NSE research, portfolio tracking and price alerts into one app — with TradersHub, a place to see what other Kenyan investors think before you decide.</p>
              <div className="hero-actions">
                <a href="/auth?mode=signup" className="btn btn-primary btn-lg">Create free account</a>
                <a href="#research" onClick={scrollToSection("research")} className="btn btn-ghost btn-lg">See what's inside</a>
              </div>
              <div className="hero-trust">
                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"></path></svg> No brokerage account required to research</span>
                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> Free to start</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="board">
              <span className="board-flag">NSE · Nairobi</span>
              <div className="board-head">
                <span className="label">Exchange board</span>
                <span className="board-live"><LivePulse />Live</span>
              </div>
              <div className="board-cols">
                <span>Symbol</span><span style={{ textAlign: "right" }}>Last</span><span style={{ textAlign: "right" }}>Chg</span>
              </div>
              {boardRows.map(([symbol, name, price, change], i) => (
                <div className={`board-row${flashRow === i ? " flash" : ""}`} key={symbol}>
                  <div>
                    <div className="board-sym">{symbol}</div>
                    <div className="board-name">{name}</div>
                  </div>
                  <div className="board-price">{price.toFixed(2)}</div>
                  <div className="board-chg" style={{ color: change >= 0 ? "var(--bull)" : "var(--bear)" }}>
                    {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                  </div>
                </div>
              ))}
              <div className="board-foot">Delayed 15 min on Free · Real-time on Premium</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          STATS (wrapped with Reveal and stagger)
      ============================================================ */}
      <section style={{ paddingTop: "0" }}>
        <div className="wrap">
          <StaggerContainer className="stats">
            <StaggerItem className="stat"><b>8</b><span>Research modules per stock</span></StaggerItem>
            <StaggerItem className="stat"><b>3</b><span>Chart types incl. candlesticks</span></StaggerItem>
            <StaggerItem className="stat"><b>NSE</b><span>Nairobi Securities Exchange focus</span></StaggerItem>
            <StaggerItem className="stat"><b>KES</b><span>Priced &amp; tracked in shillings</span></StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          OVERVIEW — what Continua actually offers, at a glance
      ============================================================ */}
      <section className="alt">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="eyebrow" style={{ justifyContent: "flex-start" }}>What Continua offers</div>
            <h2>One app for the whole job of following the NSE</h2>
            <p>Continua is built around four things a Kenyan investor actually does — research a stock, hear what other traders think, track a portfolio, and act when a price moves. Nothing here needs a brokerage account to try.</p>
          </Reveal>
          <StaggerContainer className="overview-grid">
            {overviewPillars.map((p) => (
              <StaggerItem key={p.title} className="overview-card">
                <span className="oc-icon"><p.icon size={19} strokeWidth={2} /></span>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          BRAND STORY — mission statement + dotted map of Africa
      ============================================================ */}
      <section id="brand-story" className="brand-story-section">
        <div className="wrap">
          <Reveal>
            <div className="brand-story-panel">
              <div className="brand-story-media">
                <AfricaMap variant="hero" discColor="var(--card)" vigColor="var(--bg)" />
              </div>
              <div className="brand-story-copy">
                <div className="eyebrow" style={{ color: "#FF8A00" }}>Brand story</div>
                <h2>A movement, not just a platform</h2>
                <p>
                  Continua is more than a platform — it's a movement for African investors and traders to
                  access real-time insights, make smarter decisions and grow together.
                </p>
                <div className="brand-story-chips">
                  <span><Zap size={13} strokeWidth={2} /> Real-time data</span>
                  <span><BarChart3 size={13} strokeWidth={2} /> Market opportunities</span>
                  <span><ShieldCheck size={13} strokeWidth={2} /> Trust &amp; security</span>
                  <span><Globe2 size={13} strokeWidth={2} /> Africa focused</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          CONTINUA HIGHLIGHTS — auto-swiping "what's new" carousel
      ============================================================ */}
      <section id="highlights">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="eyebrow" style={{ justifyContent: "flex-start" }}>Continua Highlights</div>
            <h2>What's new, and what's worth knowing</h2>
            <p>The newest additions to Continua, and a few features worth a second look. The strip keeps moving on its own — hover to pause, or just take it in as it passes.</p>
          </Reveal>
        </div>
        <Reveal>
          <div className="highlights-viewport">
            <div className="highlights-track">
              {[...highlightItems, ...highlightItems].map((h, idx) => (
                <div className="highlight-card" key={`${h.title}-${idx}`}>
                  <div className="highlight-media" style={{ background: `linear-gradient(135deg, ${h.from}, ${h.to})` }}>
                    <span className="highlight-tag">{h.tag}</span>
                    <div className="hm-lines" aria-hidden="true">
                      <span style={{ width: "58px" }}></span>
                      <span style={{ width: "38px" }}></span>
                    </div>
                    <span className="hm-icon"><h.icon size={24} strokeWidth={2} /></span>
                  </div>
                  <div className="highlight-body">
                    <h4>{h.title}</h4>
                    <p>{h.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============================================================
          TRADERSHUB (wrapped with Reveal)
      ============================================================ */}
      <section id="tradershub" className="th-spotlight">
        <div className="wrap">
          <Reveal>
            <div className="th-spotlight-panel">
              <div className="showcase">
                <div className="showcase-copy">
                  <div className="eyebrow th-eyebrow" style={{ justifyContent: "flex-start" }}>The heart of Continua — TradersHub</div>
                  <h3>Numbers tell you what happened.<br />People tell you why it matters.</h3>
                  <p>TradersHub is a live feed built entirely around Kenyan markets — post your thesis, tag the ticker, and see how the room reacts. It's the reason Continua isn't just a research app: it's where you find out what other NSE investors are actually thinking, right now.</p>
                  <ul className="check-list">
                    <li><Check /> React with more than a like — bullish, bearish, fire and more, plus a full tray behind a tap</li>
                    <li><Check /> Nested, threaded replies, so you always know what's being answered</li>
                    <li><Check /> Follow the investors whose takes you actually want to see</li>
                    <li><Check /> Join topic and stock-specific community Rooms for live discussion</li>
                    <li><Check /> A Discover feed for trending posts, tickers and voices across the whole market</li>
                  </ul>
                  <a href="/auth?mode=signup" className="btn btn-primary" style={{ marginTop: "6px" }}>Join TradersHub free</a>
                </div>
                <div className="showcase-media">
                  <div className="media-card">
                    <div className="post-row">
                      <div className="post-avatar"></div>
                      <div><div className="post-name">Cyprian K. <span className="post-handle">@cypskip</span></div></div>
                    </div>
                    <div className="post-line" style={{ width: "96%" }}></div>
                    <div className="post-line" style={{ width: "60%" }}></div>
                    <span className="pf-chip">$SCOM +3.4%</span>
                    <div className="quote-chart">
                      <QuoteSpark points="0,50 25,44 50,48 75,30 100,36 125,18 150,26 175,10 200,20 225,6 260,14" viewBox="0 0 260 64" />
                    </div>
                    <div className="react-demo">
                      <ReactionTrayDemo />
                    </div>
                    <div className="reply-preview">
                      <div className="post-row" style={{ marginBottom: "4px" }}>
                        <div className="post-avatar" style={{ width: "20px", height: "20px" }}></div>
                        <div className="post-name" style={{ fontSize: "11.5px" }}>Amina O. <span className="post-handle">@amina_ke</span></div>
                      </div>
                      <div className="post-line" style={{ width: "80%", height: "6px" }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="th-mini-grid">
                {thMiniFeatures.map((f) => (
                  <div className="th-mini" key={f.title}>
                    <f.icon size={17} strokeWidth={2} />
                    <div>
                      <h5>{f.title}</h5>
                      <p>{f.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          RESEARCH (staggered list)
      ============================================================ */}
      <section id="research">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="eyebrow" style={{ justifyContent: "flex-start" }}>Research</div>
            <h2>Every angle on a stock, in one screen</h2>
            <p>Open any NSE-listed company and move through valuation, growth, health, dividends, ownership and risk — the way an analyst would, without needing to be one.</p>
          </Reveal>
          <StaggerContainer className="module-list">
            {researchModules.map((m) => (
              <StaggerItem key={m.code} className="module-row">
                <span className="module-code mono">{m.code}</span>
                <div>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          STOCK PAGE (showcase, wrapped with Reveal)
      ============================================================ */}
      <section className="alt" id="stock-page">
        <div className="wrap">
          <div className="showcase">
            <Reveal className="showcase-copy">
              <div className="eyebrow" style={{ justifyContent: "flex-start" }}>Stock page</div>
              <h3>One page, everything you need before you decide.</h3>
              <p>Open any listed company and get the live price, an interactive chart, and a plain-language read on the stock — all on the same screen, no tab-hopping required.</p>
              <ul className="check-list">
                <li><Check /> Switch between line, candlestick and area charts, with EMA, RSI, MACD and Bollinger Bands</li>
                <li><Check /> A bull case and a bear case, generated fresh from the stock's current numbers</li>
                <li><Check /> Set a price alert right from the chart — above or below any target</li>
                <li><Check /> The add-to-portfolio button tucks itself away while you scroll and read, and comes right back the moment you scroll up</li>
              </ul>
            </Reveal>
            <Reveal delay={0.1} className="showcase-media">
              <div className="media-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
                  <div className="post-name" style={{ fontSize: "15px" }}>SCOM <span className="post-handle">Safaricom PLC</span></div>
                  <div style={{ textAlign: "right" }}>
                    <div className="pf-value" style={{ fontSize: "18px", display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                      <LivePulse /> KES 17.85
                    </div>
                    <span className="pf-chip">+1.7% today</span>
                  </div>
                </div>
                <div className="react-demo" style={{ marginTop: 0, marginBottom: "4px" }}>
                  <div className="react-pill on">EMA</div>
                  <div className="react-pill">RSI</div>
                  <div className="react-pill">MACD</div>
                </div>
                <div className="quote-chart" style={{ height: "78px" }}>
                  {/* Genuinely live, not a one-time draw-in — this line keeps
                      ticking with a fresh point for as long as it's on screen. */}
                  <LiveTickingChart seed={[58, 52, 56, 38, 44, 26, 34, 18, 28, 14, 20, 24, 16, 22, 12, 18, 8, 14, 20, 10]} height={78} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "14px" }}>
                  <div style={{ background: "var(--primary-tint)", borderRadius: "8px", padding: "9px 11px" }}>
                    <div className="mono" style={{ fontSize: "10px", fontWeight: 600, color: "var(--primary)", marginBottom: "3px", letterSpacing: ".04em", textTransform: "uppercase" }}>Bull case</div>
                    <p style={{ fontSize: "11.5px", color: "var(--fg)", margin: 0, lineHeight: 1.4 }}>Subscriber growth and M-Pesa margins keep outpacing the sector.</p>
                  </div>
                  <div style={{ background: "var(--bear-tint)", borderRadius: "8px", padding: "9px 11px" }}>
                    <div className="mono" style={{ fontSize: "10px", fontWeight: 600, color: "var(--bear)", marginBottom: "3px", letterSpacing: ".04em", textTransform: "uppercase" }}>Bear case</div>
                    <p style={{ fontSize: "11.5px", color: "var(--fg)", margin: 0, lineHeight: 1.4 }}>Regulatory pressure on mobile money fees remains a watch-point.</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", padding: "9px 12px", background: "var(--bg-alt)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>Alert when above</span>
                  <span className="mono" style={{ fontSize: "12px", fontWeight: 600 }}>KES 20.00</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================
          PORTFOLIO (charts animate in only once scrolled into view)
      ============================================================ */}
      <section className="alt" id="portfolio">
        <div className="wrap">
          <div className="showcase reverse">
            <Reveal className="showcase-copy">
              <div className="eyebrow" style={{ justifyContent: "flex-start" }}>Portfolio</div>
              <h3>Your holdings, tracked properly — in shillings.</h3>
              <p>Log what you own and Continua keeps score: gains and losses per holding, how your allocation breaks down, and how it's all trending over time — built for the way Kenyan investors actually hold NSE stocks.</p>
              <ul className="check-list">
                <li><Check /> Performance chart with a real crosshair — drag to see any day's value</li>
                <li><Check /> Sector and asset allocation, broken down at a glance</li>
                <li><Check /> A watchlist for stocks you're circling but haven't bought yet</li>
              </ul>
            </Reveal>
            <Reveal delay={0.1} className="showcase-media">
              {/* ---- Portfolio value with CountUp, chart grows in once visible ---- */}
              <div className="media-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                  <div>
                    <div className="pf-value-label">Portfolio value</div>
                    <div className="pf-value">KES <CountUp target={184650} /></div>
                  </div>
                  <span className="pf-chip">+12.4% overall</span>
                </div>
                <div className="pf-chart">
                  <AnimateChartOnView>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={portfolioLineData}>
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#25935F"
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={true}
                          animationDuration={1500}
                          animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </AnimateChartOnView>
                </div>
              </div>
              {/* ---- Donut charts, animate in once visible ---- */}
              <div className="media-card">
                <div className="donut-row">
                  {/* Sector Allocation */}
                  <div>
                    <div className="donut-title">Sector allocation</div>
                    <div className="donut-wrap">
                      <div style={{ width: 96, height: 96 }}>
                        <AnimateChartOnView>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={sectorData}
                                dataKey="value"
                                cx="50%"
                                cy="50%"
                                innerRadius={28}
                                outerRadius={40}
                                paddingAngle={2}
                                isAnimationActive={true}
                                animationDuration={1200}
                              >
                                {sectorData.map((entry, idx) => (
                                  <Cell key={`cell-${idx}`} fill={entry.fill} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </AnimateChartOnView>
                      </div>
                      <ul className="donut-legend">
                        {sectorData.map((d) => (
                          <li key={d.name}>
                            <span className="dot" style={{ background: d.fill }} />
                            {d.name}
                            <b>{d.value}%</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {/* Asset Allocation */}
                  <div>
                    <div className="donut-title">Asset allocation</div>
                    <div className="donut-wrap">
                      <div style={{ width: 96, height: 96 }}>
                        <AnimateChartOnView>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={assetData}
                                dataKey="value"
                                cx="50%"
                                cy="50%"
                                innerRadius={28}
                                outerRadius={40}
                                paddingAngle={2}
                                isAnimationActive={true}
                                animationDuration={1200}
                              >
                                {assetData.map((entry, idx) => (
                                  <Cell key={`cell-${idx}`} fill={entry.fill} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </AnimateChartOnView>
                      </div>
                      <ul className="donut-legend">
                        {assetData.map((d) => (
                          <li key={d.name}>
                            <span className="dot" style={{ background: d.fill }} />
                            {d.name}
                            <b>{d.value}%</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================
          DIVERSIFICATION & SNOWFLAKE TOOLS — the real portfolio + report
          instruments, not mockups: same data shapes, same "always draws,
          even empty" chart philosophy as the live app.
      ============================================================ */}
      <section id="tools" className="alt">
        <div className="wrap">
          <Reveal className="section-head" style={{ margin: "0 auto 40px", textAlign: "center" }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>How the tools actually work</div>
            <h2>Not just charts. Instruments.</h2>
            <p style={{ margin: "0 auto" }}>
              Four tools pulled straight from Continua's portfolio and stock report screens. Tap the donut, watch the
              radar shapes draw in, and notice the one thing they all share: every chart here draws its full frame
              even when the underlying data is thin — nothing gets hidden, nothing gets faked.
            </p>
          </Reveal>
          <StaggerContainer className="tools-grid">
            <StaggerItem><DiversificationDonutDemo /></StaggerItem>
            <StaggerItem><DiversificationSankeyDemo /></StaggerItem>
            <StaggerItem><SnowflakeDemo /></StaggerItem>
            <StaggerItem><RiskPentagonDemo /></StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          GETTING STARTED (steps staggered)
      ============================================================ */}
      <section>
        <div className="wrap">
          <Reveal className="section-head" style={{ margin: "0 auto 48px", textAlign: "center" }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>Getting started</div>
            <h2>Three steps, and you're across the market</h2>
          </Reveal>
          <StaggerContainer className="steps">
            <StaggerItem className="step"><div className="step-line"></div><span className="num">01</span><h3>Create your account</h3><p>Sign up with email or Google — no brokerage or bank details required to start researching.</p></StaggerItem>
            <StaggerItem className="step"><div className="step-line"></div><span className="num">02</span><h3>Build your watchlist</h3><p>Search any NSE-listed company, add it to your watchlist, and set a price alert if you have a target in mind.</p></StaggerItem>
            <StaggerItem className="step"><span className="num">03</span><h3>Join the conversation</h3><p>Post your take on TradersHub, or just read what other Kenyan investors are watching this week.</p></StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          MORE FEATURES (staggered grid)
      ============================================================ */}
      <section id="more-features">
        <div className="wrap">
          <Reveal className="section-head" style={{ margin: "0 auto 40px", textAlign: "center" }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>And everything else</div>
            <h2>The smaller features that add up</h2>
            <p style={{ margin: "0 auto" }}>Beyond research, charts and TradersHub, Continua fills in the rest of what an NSE investor actually needs.</p>
          </Reveal>
          <StaggerContainer className="more-grid">
            {moreFeatures.map((f) => (
              <StaggerItem key={f.title} className="more-item">
                <f.icon size={18} strokeWidth={2} />
                <h5>{f.title}</h5>
                <p>{f.body}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          TRUST (staggered)
      ============================================================ */}
      <section className="alt">
        <div className="wrap">
          <Reveal className="section-head">
            <div className="eyebrow" style={{ justifyContent: "flex-start" }}>Built to be trusted</div>
            <h2>Serious about the details you don't see</h2>
          </Reveal>
          <StaggerContainer className="trust-grid">
            {trustItems.map((t) => (
              <StaggerItem key={t.code} className="trust-col">
                <span className="module-code mono">{t.code}</span>
                <h4>{t.title}</h4>
                <p>{t.body}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          CTA BAND (wrapped with Reveal)
      ============================================================ */}
      <section>
        <div className="wrap">
          <Reveal>
            <div className="cta-band">
              <div className="cta-tape" aria-hidden="true">
                <span>{tickerItems.map(t => `${t.symbol} ${t.price.toFixed(2)}`).join("   ·   ")}</span>
              </div>
              <div>
                <h2>Start researching the NSE today</h2>
                <p>Free to create an account. Bring your watchlist, set your first alert, and see what TradersHub is saying about it.</p>
              </div>
              <a href="/auth?mode=signup" className="btn btn-primary btn-lg">Create free account</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          PRICING (staggered cards)
      ============================================================ */}
      <section className="alt" id="pricing">
        <div className="wrap">
          <Reveal className="section-head" style={{ margin: "0 auto 44px", textAlign: "center" }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>Pricing</div>
            <h2>Free to research. Premium to go deeper.</h2>
            <p style={{ margin: "0 auto" }}>Start with the essentials at no cost. Upgrade whenever you want real-time prices, unlimited AI research, and room to write long-form posts on TradersHub.</p>
          </Reveal>
          <StaggerContainer className="pricing-grid">
            <StaggerItem className="price-card">
              <div className="plan-name">Free</div>
              <div className="plan-price">KES 0</div>
              <div className="plan-period">Forever</div>
              <ul>
                <li><Check /> Watchlists &amp; delayed prices</li>
                <li><Check /> TradersHub — post up to 500 characters</li>
                <li><Check /> Basic charts, incl. candlesticks</li>
                <li><Check /> 3 AI theses a month</li>
              </ul>
              <a href="/auth?mode=signup" className="btn btn-ghost">Create free account</a>
            </StaggerItem>
            <StaggerItem className="price-card premium">
              <div className="plan-name">Premium</div>
              <div className="plan-price">KES 800<span className="plan-period">/mo</span></div>
              <div className="plan-period">or KES 7,980/year</div>
              <ul>
                <li><Check /> Real-time NSE prices, no delay</li>
                <li><Check /> Unlimited AI investment theses</li>
                <li><Check /> Long-form TradersHub posts, up to 5,000 characters</li>
                <li><Check /> Advanced screener &amp; priority alerts</li>
              </ul>
              <a href="/auth?mode=signup" className="btn btn-primary">Get Premium</a>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ============================================================
          FAQ (reveal each item)
      ============================================================ */}
      <section id="faq">
        <div className="wrap" style={{ maxWidth: "760px" }}>
          <Reveal className="section-head" style={{ marginBottom: "28px" }}>
            <div className="eyebrow" style={{ justifyContent: "flex-start" }}>FAQ</div>
            <h2>Good to know</h2>
          </Reveal>

          <Reveal>
            <details className="faq-item" open={true}>
              <div className="faq-code mono">F.01</div>
              <div className="faq-body">
                <summary>Do I need a brokerage account to use Continua?</summary>
                <p>No. You can research stocks, build a watchlist, set alerts and use TradersHub without a linked brokerage account. Continua is a research and portfolio-tracking companion, not a trading platform.</p>
              </div>
            </details>
          </Reveal>
          <Reveal delay={0.05}>
            <details className="faq-item">
              <div className="faq-code mono">F.02</div>
              <div className="faq-body">
                <summary>Which stocks does Continua cover?</summary>
                <p>Continua is built around companies listed on the Nairobi Securities Exchange (NSE), across banking, telecoms, manufacturing, energy, insurance and more.</p>
              </div>
            </details>
          </Reveal>
          <Reveal delay={0.1}>
            <details className="faq-item">
              <div className="faq-code mono">F.03</div>
              <div className="faq-body">
                <summary>Is TradersHub the same as my portfolio?</summary>
                <p>No — they're connected but separate. TradersHub is the social feed where you post and discuss. Your portfolio and watchlist stay private by default, and you decide if and what to share.</p>
              </div>
            </details>
          </Reveal>
          <Reveal delay={0.15}>
            <details className="faq-item">
              <div className="faq-code mono">F.04</div>
              <div className="faq-body">
                <summary>Is Continua free?</summary>
                <p>Yes, creating an account and using the core research, watchlist, alerts and TradersHub features is free.</p>
              </div>
            </details>
          </Reveal>
        </div>
      </section>

      {/* ============================================================
          FOOTER
      ============================================================ */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <div className="brand" style={{ marginBottom: "12px" }}>
                <ContinuaMark size={30} bare className="mark" />
                <span>Continua</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--muted)", maxWidth: "260px", lineHeight: "1.6" }}>Research, track and discuss Nairobi Securities Exchange stocks in one place.</p>
            </div>
            <div>
              <h5>Product</h5>
              <a href="#highlights" onClick={scrollToSection("highlights")}>Highlights</a>
              <a href="#research" onClick={scrollToSection("research")}>Research</a>
              <a href="#stock-page" onClick={scrollToSection("stock-page")}>Stock page</a>
              <a href="#tradershub" onClick={scrollToSection("tradershub")}>TradersHub</a>
              <a href="#portfolio" onClick={scrollToSection("portfolio")}>Portfolio</a>
              <a href="#tools" onClick={scrollToSection("tools")}>Tools</a>
            </div>
            <div>
              <h5>Company</h5>
              <a href="#">About</a>
              <a href="#">Contact</a>
              <a href="#">Careers</a>
            </div>
            <div>
              <h5>Legal</h5>
              <a href="#">Terms of Service</a>
              <a href="#">Privacy Policy</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Continua. All rights reserved.</span>
            <span>Nairobi, Kenya</span>
          </div>
        </div>
      </footer>
    </>
  );
};

export default ContinuaLandingPage;