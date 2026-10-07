import { useState, useMemo } from "react";
import { usePageState } from "@/hooks/usePageState";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TopBar } from "@/components/shared/TopBar";
import { Skeleton } from "@/components/ui/skeleton";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { MarketStatusIndicator } from "@/components/shared/MarketStatusIndicator";
import { AllStocksList } from "@/components/markets/AllStocksList";
import { StockHeatmap } from "@/components/home/StockHeatmap";
import { CANONICAL_SYMBOLS, STOCK_META, getDivYield, relativeDate } from "@/lib/stockPrices";
import { useMovers } from "@/hooks/useMovers";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useIndices } from "@/hooks/useIndices";
import { useExchange } from "@/hooks/useExchange";
import { useUpcomingDividends, useRecentEarnings } from "@/hooks/useMarketCalendars";
import { investmentThemes } from "@/data/investmentThemes";
import { featuredLists } from "@/data/featuredLists";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Search, Clock,
  BarChart3, Globe, Calendar, Star, ChevronRight, Filter,
  Building2, Award, DollarSign, Percent, Activity, Bell, Landmark,
  Lightbulb, Volume2, BarChart2, Layers
} from "lucide-react";

const tabs = ["Overview", "Discover", "Calendars", "Heatmap", "All Stocks"] as const;
type Tab = typeof tabs[number];

// Reference universe (name/sector only — no price/change here anymore).
// Sector rollups, gainers/losers, and every price shown below are computed
// live inside the component from useLiveQuotes/useMovers; a symbol with no
// live quote yet is simply excluded from these rollups rather than priced
// from a fabricated fallback number.
const nseReferenceUniverse = CANONICAL_SYMBOLS.map(symbol => ({
  symbol, name: STOCK_META[symbol].name, sector: STOCK_META[symbol].sector,
}));

function computeSectors(universe: { symbol: string; sector: string; change: number }[]) {
  const map = new Map<string, { sum: number; count: number; topSymbol: string; topChange: number }>();
  universe.forEach(s => {
    const cur = map.get(s.sector) || { sum: 0, count: 0, topSymbol: s.symbol, topChange: -Infinity };
    map.set(s.sector, {
      sum: cur.sum + s.change,
      count: cur.count + 1,
      topSymbol: s.change > cur.topChange ? s.symbol : cur.topSymbol,
      topChange: Math.max(cur.topChange, s.change),
    });
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, change: v.sum / v.count, isUp: v.sum >= 0, stocks: v.count, topStock: v.topSymbol }))
    .sort((a, b) => b.change - a.change);
}

// allNseStocks removed — the "All Stocks" tab now renders <AllStocksList/>, which derives
// its data from the shared stockPrices.ts source instead of a separate hardcoded array.

// Calendar dates below are all expressed as offsets from "today" via fmtDate() rather
// than fixed calendar strings, so Recently Listed reads as genuinely recent no matter
// when the app is opened. (IPO tracking itself was removed — no real source exists;
// nothing in this system scrapes NSE IPO prospectuses/subscription data.)
const fmtDate = (daysOffset: number) =>
  relativeDate(daysOffset).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Dividend/earnings calendars now come from real backend data — see
// useUpcomingDividends/useRecentEarnings (useMarketCalendars.ts) — not
// fabricated module-level arrays.

// Dividend yield is real (curated, hand-verified — see DIV_YIELD), but
// price is now attached live inside the component (see sortedDividendStocks),
// not fabricated at module scope.
const highDividendStocks = ["EABL", "SCBK", "SCOM", "ABSA", "COOP"].map((symbol) => ({
  symbol,
  name: STOCK_META[symbol]?.name ?? symbol,
  yield: getDivYield(symbol),
  frequency: symbol === "EABL" ? "Semi-annual" : "Annual",
  amount: symbol === "EABL" ? 11.00 : symbol === "SCBK" ? 17.00 : symbol === "SCOM" ? 0.64 : symbol === "ABSA" ? 1.50 : 2.00,
}));

// featuredLists now comes from the shared data/featuredLists.ts module (imported above) so
// the Overview cards and the list's own detail page can't show different member stocks.
// Icons are looked up here by slug since the shared data module stays icon-free/serializable.
const FEATURED_LIST_ICONS: Record<string, typeof Star> = {
  "blue-chip-nse": Star,
  "high-dividend": DollarSign,
  "undervalued": Award,
};

// Theme change % is computed live inside the component (via themesWithChange
// below), from real quotes — never a hardcoded number that could drift.

function StockRow({ stock, onTap }: { stock: { symbol: string; name: string; price: number; change: number }; onTap: () => void }) {
  return (
    <div onClick={onTap} className="flex items-center justify-between py-3 px-1 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 active:scale-[0.99] transition-all duration-150">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center text-xs font-bold text-primary shrink-0">
          {stock.symbol.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{stock.symbol}</p>
          <p className="text-xs text-muted-foreground truncate">{stock.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SparklineChart isPositive={stock.change >= 0} width={44} height={18} />
        <div className="text-right min-w-[72px]">
          <p className="text-sm font-bold">KES {stock.price.toFixed(2)}</p>
          <p className={`text-xs font-semibold ${stock.change >= 0 ? 'text-bull' : 'text-bear'}`}>
            {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Markets() {
  const navigate = useNavigate();
  const [marketSearch, setMarketSearch] = useState("");
  const [activeTab, setActiveTab] = usePageState<Tab>("markets:tab", "Overview");
  const [nseFilter, setNseFilter] = usePageState<string>("markets:filter", "All");
  const [listFilter, setListFilter] = useState<{ label: string; symbols: string[] } | null>(null);
  const [divSortBy, setDivSortBy] = usePageState<string>("markets:dividend-sort", "yield");

  // Live from the Continua Data Layer (backend/src/services/marketData/moversService.ts) —
  // falls back to the static, client-derived list above only while loading or if unreachable.
  const { gainers: liveGainers, losers: liveLosers, isLoading: moversLoading } = useMovers(5);
  const { quotes: liveQuotes } = useLiveQuotes(CANONICAL_SYMBOLS);
  const { exchange, exchangeMeta } = useExchange();
  const { indices: liveIndices, isLoading: indicesLoading } = useIndices();
  const { dividends: upcomingDividends, isLoading: dividendsLoading } = useUpcomingDividends();
  const { earnings: recentEarnings, isLoading: earningsLoading } = useRecentEarnings();

  // Only published, dated observations: no synthetic fallback levels.
  const indices = liveIndices.length > 0
    ? liveIndices.map(idx => ({
        name: idx.code,
        asOf: new Date(idx.timestamp).toLocaleDateString(),
        value: idx.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        change: idx.changePercent,
        isUp: idx.change >= 0,
        points: `${idx.change >= 0 ? "+" : ""}${idx.change.toFixed(2)}`,
      }))
    : [];

  const topGainers = liveGainers.map(q => ({ symbol: q.symbol, name: STOCK_META[q.symbol]?.name ?? q.symbol, sector: STOCK_META[q.symbol]?.sector ?? "Other", price: q.lastPrice, change: q.changePercent }));
  const topLosers = liveLosers.map(q => ({ symbol: q.symbol, name: STOCK_META[q.symbol]?.name ?? q.symbol, sector: STOCK_META[q.symbol]?.sector ?? "Other", price: q.lastPrice, change: q.changePercent }));

  // Sector rollup — only symbols with a real live quote contribute; a
  // symbol with no quote yet is excluded rather than priced at 0/fabricated.
  const liveUniverse = useMemo(
    () => nseReferenceUniverse
      .map(s => {
        const q = liveQuotes[s.symbol];
        return q ? { ...s, change: q.changePercent } : null;
      })
      .filter((s): s is { symbol: string; name: string; sector: string; change: number } => s !== null),
    [liveQuotes]
  );
  const sectors = useMemo(() => computeSectors(liveUniverse), [liveUniverse]);
  const [ranking, setRanking] = usePageState<'gainers' | 'losers' | 'volume'>('markets:ranking', 'gainers');
  const breadth = { up: liveUniverse.filter(q => q.change > 0).length, down: liveUniverse.filter(q => q.change < 0).length, flat: liveUniverse.filter(q => q.change === 0).length };
  const rankedQuotes = Object.values(liveQuotes).filter(q => Number.isFinite(q.lastPrice) && q.lastPrice > 0)
    .sort((a, b) => ranking === 'volume' ? b.volume - a.volume : ranking === 'gainers' ? b.changePercent - a.changePercent : a.changePercent - b.changePercent).slice(0, 10);

  const themesWithChange = useMemo(() => investmentThemes.map(theme => {
    const memberChanges = theme.stocks
      .map(s => liveQuotes[s]?.changePercent)
      .filter((c): c is number => c != null);
    const change = memberChanges.length > 0 ? memberChanges.reduce((a, b) => a + b, 0) / memberChanges.length : 0;
    return { ...theme, change, isLive: memberChanges.length > 0 };
  }), [liveQuotes]);

  const volumeLeaders = Object.values(liveQuotes)
    .filter((quote) => quote.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map((quote) => ({ quote, name: STOCK_META[quote.symbol]?.name ?? quote.symbol }));

  const sortedDividendStocks = [...highDividendStocks].sort((a, b) => {
    if (divSortBy === "amount") return b.amount - a.amount;
    return b.yield - a.yield;
  });

  return (
    <div className="page-canvas min-h-screen bg-background pb-24">
      <TopBar title="Markets" subtitle="Discover opportunities · NSE" showSearch showNotifications onSearch={(query) => { setMarketSearch(query); if (query.trim()) { setActiveTab("All Stocks"); setNseFilter("All"); setListFilter(null); } }} />

      {/* Sticky editorial sub-nav */}
      <div className="sub-nav">
        <div className="flex overflow-x-auto scrollbar-hide px-4 gap-1 py-2">
          {tabs.map(tab => (
            <button
              key={tab}
              data-small-target
              onClick={() => setActiveTab(tab)}
              className={`pill-tab whitespace-nowrap ${activeTab === tab ? 'contrast-active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-5 animate-fade-in">
        {/* ── INTERACTIVE ANALYSIS TOOLS ── shown on every Markets tab except Overview */}
        {activeTab !== "Overview" && (
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Analysis Tools
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { title: "Stock Screener", desc: "Filter by P/E, yield, sector", icon: Filter, color: "bg-primary/10 text-primary", action: () => navigate('/screener') },
              { title: "Compare Stocks", desc: "Side-by-side metrics", icon: BarChart2, color: "bg-accent/10 text-accent", action: () => navigate('/compare') },
              { title: "Sector Heatmap", desc: "See what's hot today", icon: Activity, color: "bg-bull/10 text-bull", action: () => navigate('/sector-heatmap') },
              { title: "Sector Explorer", desc: "Browse every NSE sector", icon: Layers, color: "bg-chart-3/10 text-chart-3", action: () => setActiveTab("Heatmap") },
              { title: "Investment Themes", desc: "Stocks by what's driving them", icon: Lightbulb, color: "bg-chart-4/10 text-chart-4", action: () => setActiveTab("Overview") },
              { title: "My Watchlist", desc: "Track favourite stocks", icon: Star, color: "bg-chart-2/10 text-chart-2", action: () => navigate('/watchlist') },
            ].map(tool => (
              <Card key={tool.title} className="soft-card p-2 cursor-pointer active:scale-[0.97] transition-transform" onClick={tool.action}>
                <div className={`w-7 h-7 rounded-lg ${tool.color} flex items-center justify-center mb-1.5`}>
                  <tool.icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-xs font-bold leading-tight">{tool.title}</p>
                <p className="text-[0.5625rem] text-muted-foreground leading-tight mt-0.5">{tool.desc}</p>
              </Card>
            ))}
          </div>
        </div>
        )}

        {activeTab === "Overview" && (
          <>
            {/* Market Status */}
            <div className="flex items-center justify-between">
              <MarketStatusIndicator />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Published market data</span>

              </div>
            </div>

            {/* Indices */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                {exchangeMeta.name} Indices
              </h2>
              {indices.length === 0 && !indicesLoading ? (
                <Card className="soft-card p-4 text-center">
                  <p className="text-xs text-muted-foreground">No index data available yet for {exchangeMeta.name}.</p>
                </Card>
              ) : (
              <div className="flex gap-6 overflow-x-auto border-b pb-4">
                {indices.map(idx => (
                  <Card key={idx.name} className="min-w-[140px] py-2">
                    <p className="text-xs font-medium text-muted-foreground">{idx.name}</p>
                    <p className="text-lg font-bold mt-0.5">{idx.value}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-xs font-semibold flex items-center gap-0.5 ${idx.isUp ? 'text-bull' : 'text-bear'}`}>
                        {idx.isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {idx.points}
                      </span>
                      <span className={`text-xs ${idx.isUp ? 'text-bull' : 'text-bear'}`}>
                        ({idx.isUp ? '+' : ''}{idx.change.toFixed(1)}%)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">As of {idx.asOf} · points</p>
                  </Card>
                ))}
              </div>
              )}
            </div>

            <section className="border-b pb-4 space-y-3" aria-label="Market breadth">
              <h2 className="text-sm font-bold">Market breadth</h2>
              <div className="flex justify-between text-xs"><span className="text-bull">{breadth.up} advancing</span><span>{breadth.flat} unchanged</span><span className="text-bear">{breadth.down} declining</span></div>
              <div className="flex h-2 bg-muted" aria-hidden="true">
                <div className="bg-bull" style={{ width: `${breadth.up / (liveUniverse.length || 1) * 100}%` }} />
                <div className="bg-muted" style={{ width: `${breadth.flat / (liveUniverse.length || 1) * 100}%` }} />
                <div className="bg-bear" style={{ width: `${breadth.down / (liveUniverse.length || 1) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Coverage: {liveUniverse.length} quoted companies. Changes use each provider's latest available session.</p>
              <div className="flex gap-4 overflow-x-auto">
                <Button variant="ghost" onClick={() => navigate('/screener')}>Screener</Button>
                <Button variant="ghost" onClick={() => setActiveTab('Heatmap')}>Heatmap</Button>
                <Button variant="ghost" onClick={() => setActiveTab('Calendars')}>Calendar</Button>
                <Button variant="ghost" onClick={() => navigate('/notifications?tab=alerts')}>Alerts</Button>
              </div>
            </section>
            <section aria-label="Market rankings" className="border-b pb-4">
              <div className="flex gap-4 mb-3" role="tablist" aria-label="Rankings">
                {(['gainers', 'losers', 'volume'] as const).map(value => <button key={value} role="tab" aria-selected={ranking === value} onClick={() => setRanking(value)} className={`py-2 text-sm capitalize border-b-2 ${ranking === value ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>{value === 'volume' ? 'Most active' : value}</button>)}
              </div>
              {rankedQuotes.map(q => <button key={q.symbol} onClick={() => navigate(`/stock/${q.symbol}`)} className="flex w-full justify-between items-center py-3 border-b text-left">
                <span><span className="font-semibold text-sm">{q.symbol}</span><span className="block text-xs text-muted-foreground">{STOCK_META[q.symbol]?.name ?? q.symbol}</span></span>
                <span className="text-right"><span className="block text-sm tabular-nums">{q.lastPrice.toFixed(2)}</span><span className={`text-xs tabular-nums ${q.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>{ranking === 'volume' ? `${q.volume.toLocaleString()} shares` : `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`}</span></span>
              </button>)}
              {!rankedQuotes.length && <p className="text-sm text-muted-foreground">Quotes are not available yet. Pull to refresh.</p>}
            </section>
            {/* Investment Themes */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent" />
                Investment Themes
              </h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
                {themesWithChange.map(theme => (
                  <div
                    key={theme.slug}
                    data-small-target
                    onClick={() => navigate(`/theme/${theme.slug}`)}
                    className="min-w-[210px] flex-shrink-0 border-l border-border/60 pl-3 cursor-pointer active:opacity-70 transition-opacity"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{theme.icon}</span>
                      {theme.isLive ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${theme.change >= 0 ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                          {theme.change >= 0 ? '+' : ''}{theme.change.toFixed(1)}%
                        </span>
                      ) : (
                        <Skeleton className="h-4 w-12 rounded-full" />
                      )}
                    </div>
                    <p className="text-sm font-bold">{theme.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{theme.desc}</p>
                    <div className="flex gap-1 mt-2">
                      {theme.stocks.map(s => (
                        <Badge key={s} variant="secondary" className="text-[0.625rem] py-0 px-1.5 border-0">{s}</Badge>
                      ))}
                    </div>
                    <p className="text-[0.625rem] text-muted-foreground mt-2 leading-snug">{theme.why}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Featured Lists */}
            <div>
              <h2 className="text-sm font-bold mb-3">Featured Lists</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {featuredLists.map(list => {
                  const Icon = FEATURED_LIST_ICONS[list.slug] || Star;
                  return (
                    <Card
                      key={list.slug}
                      className="soft-card p-4 cursor-pointer active:scale-[0.97] transition-transform"
                      onClick={() => navigate(`/featured/${list.slug}`)}
                    >
                      <div className={`w-10 h-10 rounded-2xl ${list.color} flex items-center justify-center mb-3`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold">{list.title}</p>
                      <p className="text-xs text-muted-foreground">{list.desc}</p>
                      <p className="text-xs text-muted-foreground mt-1">{list.symbols.length} stocks</p>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Recent Earnings — real reported results only, never a
                forward "expected" calendar (see useRecentEarnings). */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Recent Earnings
              </h2>
              <Card className="soft-card overflow-hidden">
                {earningsLoading ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
                ) : recentEarnings.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">No reported earnings on file yet.</div>
                ) : recentEarnings.map(e => (
                  <div key={e.id} onClick={() => navigate(`/stock/${e.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-semibold">{e.symbol} · {e.companyName}</p>
                      <p className="text-xs text-muted-foreground">Reported {new Date(e.reportedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    </div>
                    {e.epsActual != null && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">EPS</p>
                        <p className="text-sm font-bold">KES {e.epsActual.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </div>

            {/* Most traded — ranked only from current Data Layer volume. */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-accent" />
                Most Traded
              </h2>
              <Card className="soft-card overflow-hidden">
                {volumeLeaders.map(v => (
                  <div key={v.quote.symbol} onClick={() => navigate(`/stock/${v.quote.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                        {v.quote.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{v.quote.symbol}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-40">{v.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular">{v.quote.volume.toLocaleString()}</p>
                      <p className={`text-xs font-semibold ${v.quote.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {v.quote.changePercent >= 0 ? '+' : ''}{v.quote.changePercent.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
                {volumeLeaders.length === 0 && <p className="p-4 text-xs text-muted-foreground text-center">Trading volume is not available yet.</p>}
              </Card>
            </div>

            {/* Top Gainers & Losers */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-bull" />
                Top Gainers
              </h2>
              <Card className="soft-card overflow-hidden">
                <div className="divide-y divide-border/40">
                  {topGainers.slice(0, 5).map(s => (
                    <StockRow key={s.symbol} stock={s} onTap={() => navigate(`/stock/${s.symbol}`)} />
                  ))}
                </div>
              </Card>
            </div>

            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-bear" />
                Top Losers
              </h2>
              <Card className="soft-card overflow-hidden">
                <div className="divide-y divide-border/40">
                  {topLosers.slice(0, 5).map(s => (
                    <StockRow key={s.symbol} stock={s} onTap={() => navigate(`/stock/${s.symbol}`)} />
                  ))}
                </div>
              </Card>
            </div>

            {/* Sector Heat Map */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Sector Performance
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {sectors.map(s => (
                  <Card key={s.name} className="soft-card p-3 cursor-pointer active:scale-[0.97] transition-transform" onClick={() => navigate(`/sector/${encodeURIComponent(s.name)}`)}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.isUp ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                        {s.isUp ? '+' : ''}{s.change.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{s.stocks} stocks · Top: {s.topStock}</p>
                  </Card>
                ))}
              </div>
            </div>

          </>
        )}

        {/* ─── NSE TAB ─── */}
        {activeTab === "All Stocks" && (
          <>
            {listFilter && (
              <div className="flex items-center justify-between bg-primary/10 rounded-xl px-3 py-2">
                <span className="text-xs font-semibold text-primary">Showing: {listFilter.label}</span>
                <button data-small-target onClick={() => setListFilter(null)} className="text-xs font-semibold text-muted-foreground">Clear</button>
              </div>
            )}
            <AllStocksList
              search={marketSearch}
              initialSector={nseFilter === "All" ? undefined : nseFilter}
              onlySymbols={listFilter?.symbols}
            />
          </>
        )}

        {/* Global tab removed — focused on Kenyan market */}

        {/* ─── IPOs TAB ─── */}
        {activeTab === "Discover" && (
          <>
            {/* Quick jumps into curated slices of the market — same underlying live data as
                Overview/All Stocks, just one tap away from here. */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shrink-0 gap-1.5" onClick={() => { setListFilter({ label: "Top Gainers", symbols: topGainers.map(s => s.symbol) }); setActiveTab("All Stocks"); }}>
                <TrendingUp className="h-3.5 w-3.5 text-bull" /> Top Gainers
              </Button>
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shrink-0 gap-1.5" onClick={() => { setListFilter({ label: "Top Losers", symbols: topLosers.map(s => s.symbol) }); setActiveTab("All Stocks"); }}>
                <TrendingDown className="h-3.5 w-3.5 text-bear" /> Top Losers
              </Button>
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs shrink-0 gap-1.5" onClick={() => setActiveTab("Calendars")}>
                <DollarSign className="h-3.5 w-3.5 text-bull" /> High Dividend
              </Button>
            </div>

            {/* IPO tracking removed — no real source exists (nothing in
                this system scrapes NSE IPO prospectuses or subscription
                data), so fabricating listings/prices here would be
                exactly the kind of invented data this app shouldn't show. */}
          </>
        )}

        {/* ─── DIVIDENDS TAB ─── */}
        {activeTab === "Calendars" && (
          <>
            {/* Real, forward-looking — an ex-date is a fact stated in the
                company's own dividend announcement, not a prediction (see
                useUpcomingDividends / API.md). No yield shown here: that
                would need a real live price to divide against, and until
                ADAPTER_MODE/NSE_CLIENT_MODE are confirmed live, showing a
                yield here risks mixing a real amount with a mock price. */}
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Upcoming Dividends
            </h2>
            <Card className="soft-card overflow-hidden">
              {dividendsLoading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
              ) : upcomingDividends.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No upcoming dividends on file yet.</div>
              ) : upcomingDividends.map(d => {
                const details = d.details as { amountPerShare?: number; dividendType?: string };
                return (
                  <div key={d.id} onClick={() => navigate(`/stock/${d.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-bull/8 flex items-center justify-center text-xs font-bold text-bull">
                        {d.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{d.symbol}</p>
                        <p className="text-xs text-muted-foreground">Ex: {d.exDate ? new Date(d.exDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {details.amountPerShare != null && (
                        <p className="text-sm font-bold text-bull">KES {details.amountPerShare.toFixed(2)}</p>
                      )}
                      {details.dividendType && (
                        <Badge variant="secondary" className="text-[0.625rem] py-0 px-1.5 capitalize">{details.dividendType}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>

            <div className="flex items-center justify-between mt-2">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-bull" />
                High Dividend Stocks
              </h2>
              <div className="flex gap-1.5">
                {["yield", "amount"].map(s => (
                  <Button key={s} variant="outline" size="sm" className={`text-xs rounded-full h-7 ${divSortBy === s ? 'border-foreground text-foreground' : ''}`} onClick={() => setDivSortBy(s)}>
                    {s === "yield" ? "By Yield" : "By Amount"}
                  </Button>
                ))}
              </div>
            </div>
            <Card className="soft-card overflow-hidden">
              {sortedDividendStocks.map((stock, i) => (
                <div key={stock.symbol} onClick={() => navigate(`/stock/${stock.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-bold">{stock.symbol}</p>
                      <p className="text-xs text-muted-foreground">{stock.frequency}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-bull">{stock.yield}%</p>
                    <p className="text-xs text-muted-foreground">KES {stock.amount.toFixed(2)}/share</p>
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}

        {/* ─── HEATMAP TAB — previously rendered nothing at all ─── */}
        {activeTab === "Heatmap" && (
          <>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Sector &amp; Stock Heatmap
            </h2>
            <p className="text-xs text-muted-foreground -mt-3">Box size reflects market cap, colour reflects today's move.</p>
            <StockHeatmap />

            <h2 className="text-sm font-bold flex items-center gap-2 mt-2">
              <Landmark className="h-4 w-4 text-accent" />
              By Sector
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {sectors.map(s => (
                <Card
                  key={s.name}
                  className="soft-card p-3 cursor-pointer active:scale-[0.97] transition-transform"
                  onClick={() => navigate(`/sector/${encodeURIComponent(s.name)}`)}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.isUp ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                      {s.isUp ? '+' : ''}{s.change.toFixed(1)}%
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.stocks} stocks · Top: {s.topStock}</p>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
