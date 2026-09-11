import { useMemo, useState } from "react";
import { Sankey, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Layer, Rectangle } from "recharts";
import { tooltipStyle } from "@/lib/chartPalette";
import { InfoTip } from "./InfoTip";
import { useHistoricalCandles } from "@/hooks/useHistoricalCandles";

interface HoldingLike {
  symbol: string;
  name?: string;
  sector?: string;
  value: number;
}

interface PortfolioDiversificationProps {
  holdings: HoldingLike[];
  showValues?: boolean;
  currencyLabel?: string;
}

// Deterministic hue per ticker so the holdings donut stays stable across
// renders and sessions without maintaining a hand-curated lookup table.
const PALETTE = ["#3b82f6", "#10b981", "#eab308", "#a855f7", "#f97316", "#14b8a6", "#ef4444", "#6366f1", "#ec4899", "#84cc16"];
function colorFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// The Sankey (Portfolio → Sector → Holding) uses one consistent flow color
// throughout, same as Simply Wall St's diversification diagram — the value
// of the diagram is in the shape of the flow and the % labels, not in
// color-coding every sector, which just adds visual noise.
const FLOW_COLOR = "hsl(38 92% 50%)";

export function PortfolioDiversification({ holdings, showValues = true, currencyLabel = "KSh" }: PortfolioDiversificationProps) {
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const hasHoldings = holdings.length > 0 && totalValue > 0;

  const sankeyData = useMemo(() => {
    if (!hasHoldings) {
      // Placeholder shape so the diagram frame always renders — same
      // single sector/ticker layout, until there's a real holding to flow.
      return {
        nodes: [{ name: "Portfolio" }, { name: "No sector yet" }, { name: "No holding yet" }],
        links: [{ source: 0, target: 1, value: 1 }, { source: 1, target: 2, value: 1 }],
        sectors: ["No sector yet"],
      };
    }
    const sectors = [...new Set(holdings.map((h) => h.sector || "Other"))];
    const nodes: { name: string }[] = [{ name: "Portfolio" }, ...sectors.map((s) => ({ name: s })), ...holdings.map((h) => ({ name: h.symbol }))];
    const sectorIndex = (s: string) => 1 + sectors.indexOf(s);
    const tickerIndex = (i: number) => 1 + sectors.length + i;

    const links: { source: number; target: number; value: number }[] = [];
    sectors.forEach((s) => {
      const sectorTotal = holdings.filter((h) => (h.sector || "Other") === s).reduce((sum, h) => sum + h.value, 0);
      links.push({ source: 0, target: sectorIndex(s), value: sectorTotal });
    });
    holdings.forEach((h, i) => {
      links.push({ source: sectorIndex(h.sector || "Other"), target: tickerIndex(i), value: h.value });
    });

    return { nodes, links, sectors };
  }, [holdings, totalValue, hasHoldings]);

  const donutData = useMemo(() => {
    if (!hasHoldings) return [{ name: "No holdings yet", fullName: "No holdings yet", value: 1, pct: 100, isOther: false }];
    // Every holding gets its own slice and outer label — no bucketing into
    // an "Others" catch-all, so nothing you actually hold goes unlabeled.
    return [...holdings]
      .sort((a, b) => b.value - a.value)
      .map((h) => ({ name: h.symbol, fullName: h.name || h.symbol, value: h.value, pct: totalValue > 0 ? (h.value / totalValue) * 100 : 0, isOther: false }));
  }, [holdings, totalValue, hasHoldings]);

  // Which slice's detail is shown in the center of the ring — defaults to
  // the largest holding, updates on tap.
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const selected = donutData.find((d) => d.name === selectedTicker) ?? donutData[0];
  const selectedSymbol = hasHoldings && selected && !selected.isOther ? selected.name : undefined;

  // 1Y and 7D change for the selected holding, computed from the same real
  // daily-candle history the stock detail chart uses — not fabricated.
  // Shows "n/a" (matching Simply Wall St's own fallback) when there isn't
  // enough price history on file yet, rather than a guessed number.
  const oneYear = useHistoricalCandles(selectedSymbol, "1Y");
  const oneWeek = useHistoricalCandles(selectedSymbol, "1W");
  const pctChange = (points: { close: number }[]) => {
    if (points.length < 2) return null;
    const first = points[0].close;
    if (!first) return null;
    return ((points[points.length - 1].close - first) / first) * 100;
  };
  const yearPct = pctChange(oneYear.points);
  const weekPct = pctChange(oneWeek.points);

  return (
    <div className="space-y-4">
      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
          Diversification across Industries
          <InfoTip>How your portfolio value flows from sector into individual holdings, based on each position's current market value.</InfoTip>
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          How your value flows from sector into individual holdings.
        </p>
        <div className="h-[380px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={sankeyData}
              nodeWidth={hasHoldings ? 3 : 2}
              nodePadding={22}
              margin={{ top: 8, right: 92, bottom: 8, left: 8 }}
              link={{ stroke: FLOW_COLOR, strokeOpacity: hasHoldings ? 0.35 : 0.12 }}
              node={(props: any) => (
                <SankeyNodeShape {...props} rootIndex={0} sectorCount={sankeyData.sectors.length} muted={!hasHoldings} totalValue={totalValue} />
              )}
            >
              <Tooltip
                formatter={(v: number) => [hasHoldings ? (showValues ? `${currencyLabel}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "••••") : "No holdings yet", ""]}
                contentStyle={tooltipStyle}
              />
            </Sankey>
          </ResponsiveContainer>
        </div>
        {!hasHoldings && <p className="text-[10px] text-muted-foreground mt-1">Add a holding to see how your value flows across sectors.</p>}
      </div>

      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
          Diversification across Holdings
          <InfoTip>Each holding's share of your total portfolio value — a concentration check, not a performance measure. Tap a slice to see its detail.</InfoTip>
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">How much of your portfolio each holding represents.</p>
        <div className="h-[360px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 28, right: 56, bottom: 28, left: 56 }}>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="68%"
                paddingAngle={hasHoldings ? 1.5 : 0}
                stroke="none"
                label={hasHoldings ? renderOuterLabel : undefined}
                labelLine={false}
              >
                {donutData.map((d) => (
                  <Cell
                    key={d.name}
                    onClick={() => { if (hasHoldings && !d.isOther) setSelectedTicker(d.name); }}
                    fill={hasHoldings ? (d.isOther ? "hsl(var(--muted-foreground) / 0.35)" : colorFor(d.name)) : "hsl(var(--muted-foreground) / 0.2)"}
                    stroke={hasHoldings && selected?.name === d.name ? "hsl(var(--background))" : "none"}
                    strokeWidth={hasHoldings && selected?.name === d.name ? 2 : 0}
                    style={hasHoldings && !d.isOther ? { cursor: "pointer" } : undefined}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {selected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
              <p className="text-[13px] font-bold leading-tight" style={{ color: hasHoldings ? (selected.isOther ? "hsl(var(--muted-foreground))" : colorFor(selected.name)) : "hsl(var(--muted-foreground))" }}>
                {selected.name}
              </p>
              {hasHoldings && <p className="text-base font-bold tabular leading-tight">{selected.pct.toFixed(1)}%</p>}
              {hasHoldings && !selected.isOther && (
                <div className="mt-1 w-24 space-y-px">
                  <div className="flex items-center justify-between text-[9.5px] leading-tight">
                    <span className="text-muted-foreground">Value</span>
                    <span className="font-semibold tabular">{showValues ? `${currencyLabel}${selected.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "••••"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] leading-tight">
                    <span className="text-muted-foreground">1Y</span>
                    <span className="font-semibold tabular">{oneYear.isLoading ? "…" : yearPct === null ? "n/a" : `${yearPct >= 0 ? "+" : ""}${yearPct.toFixed(1)}%`}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] leading-tight">
                    <span className="text-muted-foreground">7D</span>
                    <span className={`font-semibold tabular ${weekPct !== null ? (weekPct >= 0 ? "text-bull" : "text-bear") : ""}`}>
                      {oneWeek.isLoading ? "…" : weekPct === null ? "n/a" : `${weekPct >= 0 ? "+" : ""}${weekPct.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
          Revenue Diversification by Geography
          <InfoTip>
            NSE-listed issuers don't consistently disclose structured geographic revenue splits
            the way Continua's data layer ingests financials today, so this can't be filled in
            honestly yet — shown here so the tool is visibly present rather than silently missing.
          </InfoTip>
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">Where your holdings actually earn their revenue.</p>
        <div className="h-56 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={[{ name: "Not Reported", value: 100 }]} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" stroke="none">
                <Cell fill="hsl(var(--muted-foreground) / 0.35)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-8 text-center">
            <p className="text-sm font-bold">Not Reported</p>
            <p className="text-[10.5px] text-muted-foreground mt-1">Geographic revenue data isn't tracked for NSE issuers yet</p>
          </div>
        </div>
      </div>

      {/* Revenue-by-geography above is intentionally a placeholder, not a
          fabricated breakdown: NSE-listed issuers don't consistently
          disclose structured geographic revenue splits the way Continua's
          data layer ingests financials today. */}
    </div>
  );
}

// Outer leader-line labels for the holdings donut — ticker + weight sitting
// past the ring with a short elbow line back to the slice, same layout as
// Simply Wall St's "Diversification Across Holdings" chart.
const RADIAN = Math.PI / 180;
function renderOuterLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, index, payload } = props;
  const color = payload.isOther ? "hsl(var(--muted-foreground))" : colorFor(payload.name);
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 16) * cos;
  const my = cy + (outerRadius + 16) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 12;
  const ey = my;
  const anchor = cos >= 0 ? "start" : "end";
  return (
    <g key={`diversification-label-${index}`}>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={color} strokeOpacity={0.5} fill="none" />
      <text x={ex + (cos >= 0 ? 4 : -4)} y={ey - 3} textAnchor={anchor} fontSize={10.5} fontWeight={700} fill={color}>
        {payload.name}
      </text>
      <text x={ex + (cos >= 0 ? 4 : -4)} y={ey + 9} textAnchor={anchor} fontSize={10} fill="hsl(var(--muted-foreground))">
        {payload.pct.toFixed(1)}%
      </text>
    </g>
  );
}

function SankeyNodeShape({ x, y, width, height, index, payload, rootIndex, sectorCount, muted, totalValue }: any) {
  const isRoot = index === rootIndex;
  const isSector = index > rootIndex && index <= sectorCount;
  const pct = !muted && totalValue > 0 ? (payload.value / totalValue) * 100 : 0;

  // Only the root "Portfolio" node is a solid bar — sector and holding
  // nodes are just thin flow markers with a label, same as Simply Wall
  // St's diagram, so the diagram reads as one continuous flow rather than
  // a strip of colored blocks.
  const barWidth = isRoot ? width : Math.min(width, 2);
  const barX = isRoot ? x : x + (width - barWidth) / 2;
  const fill = muted ? "hsl(var(--muted-foreground) / 0.35)" : isRoot ? "hsl(var(--foreground))" : FLOW_COLOR;
  const labelSide = x < 40 ? "start" : "end";

  return (
    <Layer>
      <Rectangle x={barX} y={y} width={barWidth} height={Math.max(height, 2)} fill={fill} radius={1} />
      <text
        x={labelSide === "start" ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={labelSide === "start" ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={10.5}
        fontWeight={isRoot ? 700 : 600}
        fill="hsl(var(--foreground))"
      >
        {payload.name}
        {isSector && !muted && <tspan fill="hsl(var(--muted-foreground))" fontWeight={500}> {pct.toFixed(1)}%</tspan>}
      </text>
    </Layer>
  );
}