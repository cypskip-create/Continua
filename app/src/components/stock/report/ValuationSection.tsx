import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { useValuation } from "@/hooks/useValuation";
import { useResearch } from "@/hooks/useResearch";
import { useSectorPeers } from "@/hooks/useSectorPeers";
import { useMarketBenchmark } from "@/hooks/useMarketBenchmark";
import { historicalApi } from "@/api/historicalApi";
import { fx } from "@/lib/chartPalette";

interface Props { symbol: string; name: string; sector: string; price: number; currency: string }

// Fixed chart heights so every widget reserves the same real estate
// whether or not data has arrived yet — matching Simply Wall St's layout,
// where the chart frame never collapses just because a value is missing.
const CHART_H_LARGE = 300;   // price/earnings history, analyst targets
const CHART_H_MEDIUM = 260;  // peer/industry comparisons
const CHART_H_SMALL = 200;   // donuts, gauges

function FairValueBar({ price, fair, currency }: { price: number; fair: number | null; currency: string }) {
  const hasFair = fair != null;
  const pct = hasFair ? ((fair! - price) / price) * 100 : 0;
  const max = Math.max(price, fair ?? price) * 1.3;
  const priceX = (price / max) * 100;
  const fairX = hasFair ? ((fair as number) / max) * 100 : null;
  return (
    <div>
      <p className={`text-2xl font-bold ${!hasFair ? "text-muted-foreground" : pct >= 0 ? "text-bull" : "text-bear"}`}>
        {hasFair ? <>{Math.abs(pct).toFixed(1)}% <span className="text-sm font-semibold">{pct >= 0 ? "Undervalued" : "Overvalued"}</span></> : "N/A"}
      </p>
      <div className="relative h-16 mt-3 rounded-lg overflow-hidden" style={{ background: hasFair ? "linear-gradient(90deg, #10b981 0%, #10b981 55%, #eab308 75%, #7f1d1d 100%)" : "hsl(var(--muted))" }}>
        <div className="absolute top-0 bottom-0 border-l-2 border-white/80" style={{ left: `${Math.min(98, priceX)}%` }}>
          <span className="absolute -top-1 left-1 text-[10px] font-bold text-white bg-black/40 px-1 rounded">Current {currency}{price.toFixed(2)}</span>
        </div>
        {hasFair && (
          <div className="absolute top-0 bottom-0 border-l-2 border-white" style={{ left: `${Math.min(98, fairX!)}%` }}>
            <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white bg-black/40 px-1 rounded">Fair Value {currency}{fair!.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ValuationSection({ symbol, name, sector, price, currency }: Props) {
  const { valuation, isLoading: valLoading } = useValuation(symbol);
  const { research } = useResearch(symbol);
  const { data: peers, isLoading: peersLoading } = useSectorPeers(sector);
  const { averages: benchmark } = useMarketBenchmark();

  const priceHistoryQuery = useQuery({
    queryKey: ["continua", "candles", symbol, "valuation-2y"],
    queryFn: () => historicalApi.getCandles(symbol, { interval: "1d", from: new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10) }),
    staleTime: 15 * 60_000,
  });
  const priceSeries = (priceHistoryQuery.data ?? []).map((c) => ({ date: c.timestamp.slice(0, 10), price: c.close }));

  const bestModel = valuation?.models.find((m) => m.fairValue != null);
  const ratios = research?.ratios;
  const peerRows = (peers ?? []).filter((p) => p.pe != null).sort((a, b) => (b.pe ?? 0) - (a.pe ?? 0));
  const peerAvg = peerRows.length > 0 ? peerRows.reduce((s, p) => s + (p.pe ?? 0), 0) / peerRows.length : null;
  const peerChartData = peerRows.slice(0, 8).map((p) => ({ symbol: p.symbol, pe: p.pe ?? 0, isSelf: p.symbol === symbol }));

  const checks = [
    { label: "Trading below fair value", status: bestModel ? (bestModel.upsidePercent! > 0 ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Trading below Sector P/E fair ratio", status: ratios?.pe != null && benchmark.pe != null ? (ratios.pe < benchmark.pe ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Analyst price target coverage", status: "unknown" as const },
  ];

  return (
    <ReportSection number={1} title="Valuation">
      <CriteriaChecklist
        checks={checks}
        narrative={bestModel ? `${symbol} trades ${Math.abs(((bestModel.fairValue! - price) / price) * 100).toFixed(1)}% ${bestModel.fairValue! > price ? "below" : "above"} its model-based fair value. Continua has no analyst coverage on file, so growth-based fair-ratio checks aren't evaluated.` : `Not enough data on file to compute a fair value for ${symbol} yet.`}
      />

      <SubWidget number="1.1" title="Share Price vs Fair Value" description={`What is the fair price of ${symbol} based on Continua's real valuation models?`}>
        <FairValueBar price={price} fair={bestModel?.fairValue ?? null} currency={currency} />
        <p className="text-[10px] text-muted-foreground mt-2">Model: {bestModel?.model ?? "None available yet"} — Continua doesn't run a discounted cash flow model.</p>
      </SubWidget>

      <SubWidget number="1.2" title="Key Valuation Metric" description={`Which real metric is available for ${symbol}?`}>
        <div className="flex items-center gap-6">
          <div style={{ width: CHART_H_SMALL, height: CHART_H_SMALL }} className="shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{ v: ratios?.pe ? Math.min(100, (1 / ratios.pe) * 100) : 0 }, { v: ratios?.pe ? 100 - Math.min(100, (1 / ratios.pe) * 100) : 100 }]} dataKey="v" innerRadius="68%" outerRadius="92%" startAngle={90} endAngle={-270} stroke="none">
                  <Cell fill="hsl(217 91% 60%)" />
                  <Cell fill="hsl(var(--muted))" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-3xl font-bold tabular">{ratios?.pe != null ? `${ratios.pe.toFixed(1)}x` : "—"}</p>
            <p className="text-[11px] text-muted-foreground">P/E Ratio — used since {symbol} is profitable</p>
            <p className="text-[11px] text-muted-foreground mt-1">P/B Ratio: {ratios?.pb != null ? `${ratios.pb.toFixed(2)}x` : "—"}</p>
          </div>
        </div>
      </SubWidget>

      <SubWidget number="1.3" title="Price to Earnings Ratio vs Peers" description={`How does ${symbol}'s P/E compare to its real NSE sector peers?`}>
        {peerAvg != null && <p className="text-[10.5px] text-muted-foreground mb-1">Peer average: {peerAvg.toFixed(1)}x</p>}
        <div style={{ height: CHART_H_MEDIUM }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peerChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}x`, "P/E"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              {peerAvg != null && <ReferenceLine x={peerAvg} stroke="hsl(38 92% 50%)" strokeDasharray="4 3" />}
              <Bar dataKey="pe" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {peerChartData.map((p) => <Cell key={p.symbol} fill={p.isSelf ? "hsl(217 91% 60%)" : "hsl(var(--bull))"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!peersLoading && peerChartData.length === 0 && <p className="text-[10px] text-muted-foreground mt-1">No sector peers with a P/E on file yet.</p>}
      </SubWidget>

      <SubWidget number="1.4" title="Historical Price to Earnings Ratio" description="Compares a stock's price to its earnings over time.">
        <div style={{ height: CHART_H_LARGE }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ratios?.pe != null ? [{ x: "Current", pe: ratios.pe }] : []}>
              <XAxis dataKey="x" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}x`, "P/E"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              <Line type="monotone" dataKey="pe" stroke={fx.revenue} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Only the current ratio is plotted — Continua doesn't have a historical P/E time series yet.</p>
      </SubWidget>

      <SubWidget number="1.5" title="Price to Earnings Ratio vs Industry" description={`How does ${symbol}'s P/E compare across its NSE sector?`}>
        <div style={{ height: CHART_H_MEDIUM }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peerChartData}>
              <XAxis dataKey="symbol" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}x`, "P/E"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              <Bar dataKey="pe" radius={[4, 4, 0, 0]}>
                {peerChartData.map((p) => <Cell key={p.symbol} fill={p.isSelf ? "hsl(217 91% 60%)" : "hsl(var(--bull) / 0.6)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {!peersLoading && peerChartData.length === 0 && <p className="text-[10px] text-muted-foreground mt-1">No sector peers on file yet.</p>}
      </SubWidget>

      <SubWidget number="1.6" title="Price to Earnings Ratio vs Fair Ratio" description="The expected P/E given forecast growth, margins and risk — needs analyst estimates Continua doesn't have.">
        <div style={{ height: CHART_H_SMALL }} className="flex items-center justify-center">
          <svg viewBox="0 0 200 110" className="w-full max-w-[240px]">
            <path d="M 20 95 A 80 80 0 0 1 180 95" stroke="hsl(var(--muted))" strokeWidth="10" fill="none" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-center text-sm font-bold -mt-4">Fair PE: N/A</p>
        <p className="text-xs text-muted-foreground py-2 text-center">Insufficient data — {symbol} has no analyst coverage on file to compute a Fair P/E Ratio.</p>
      </SubWidget>

      <SubWidget number="1.7" title="Analyst Price Targets" description="The analyst 12-month forecast and statistical confidence in the consensus target.">
        {/* Frame always renders — an empty array still draws empty axes, so
            a symbol with no price history yet shows the tool (an empty
            chart) rather than a text box in its place. */}
        <div style={{ height: CHART_H_LARGE }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceSeries}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(priceSeries.length / 5) - 1)} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => [`${currency}${v.toFixed(2)}`, "Price"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              <Area type="monotone" dataKey="price" stroke={fx.revenue} fill={fx.revenue} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {(priceHistoryQuery.isLoading || priceSeries.length === 0) && (
          <p className="text-xs text-muted-foreground mt-1">{priceHistoryQuery.isLoading ? "Loading price history…" : `No price history on file for ${symbol} yet.`}</p>
        )}
        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
          <div><p className="text-[9.5px] text-muted-foreground">Analysts</p><p className="text-sm font-bold tabular">0</p></div>
          <div><p className="text-[9.5px] text-muted-foreground">Avg 1Y Target</p><p className="text-sm font-bold tabular">N/A</p></div>
          <div><p className="text-[9.5px] text-muted-foreground">Agreement</p><p className="text-sm font-bold tabular">N/A</p></div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">The line above is real historical price — Continua has no analyst 12-month forecast feed, so no forecast cone is drawn.</p>
      </SubWidget>
    </ReportSection>
  );
}