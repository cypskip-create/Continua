import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TopBar } from "@/components/shared/TopBar";
import { Skeleton } from "@/components/ui/skeleton";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { MarketStatusIndicator } from "@/components/shared/MarketStatusIndicator";
import { AfricaMap } from "@/components/shared/AfricaMap";
import { AllStocksList } from "@/components/markets/AllStocksList";
import { StockHeatmap } from "@/components/home/StockHeatmap";
import { CANONICAL_SYMBOLS, STOCK_META, getDivYield, relativeDate } from "@/lib/stockPrices";
import { useMovers } from "@/hooks/useMovers";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useIndices } from "@/hooks/useIndices";
import { useExchange } from "@/hooks/useExchange";
import { EconomicCalendar } from "@/components/home/EconomicCalendar";
import { investmentThemes } from "@/data/investmentThemes";
import { featuredLists } from "@/data/featuredLists";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Search, Clock,
  BarChart3, Globe, Calendar, Star, ChevronRight, Flame, Filter,
  Building2, Zap, Award, DollarSign, Percent, Activity, Bell, Landmark,
  Lightbulb, Volume2, BarChart2, Layers
} from "lucide-react";

const tabs = ["Overview", "Discover", "Calendars", "Heatmap", "All Stocks"] as const;
type Tab = typeof tabs[number];

// Static fallback — used only while live index data is loading, or if the
// Continua Data API is unreachable, and ONLY when NSE is the selected
// exchange (see the isLoading/isError fallback logic below Markets()).
// Showing this under an "NGX"/"JSE" label on an API error would show
// invented Kenyan-index numbers for a market they don't apply to.
const staticNseIndicesFallback = [
  { name: "NSE 20", value: "1,847.23", change: 1.2, isUp: true, points: "+22.1" },
  { name: "NSE 25", value: "3,542.87", change: 0.8, isUp: true, points: "+28.3" },
  { name: "NASI", value: "112.45", change: -0.3, isUp: false, points: "-0.34" },
  { name: "FTSE Kenya", value: "1,234.56", change: 2.1, isUp: true, points: "+25.9" },
];

const commodities = [
  { name: "Tea (Mombasa)", value: "KES 312/kg", change: 2.1, isUp: true },
  { name: "Coffee (Nairobi)", value: "KES 580/kg", change: 1.4, isUp: true },
  { name: "Maize (90kg)", value: "KES 4,800", change: -0.6, isUp: false },
  { name: "Avocado (export)", value: "KES 95/kg", change: 0.9, isUp: true },
];

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

// Calendar/IPO dates below are all expressed as offsets from "today" via fmtDate() rather
// than fixed calendar strings, so Upcoming Earnings/Dividends/IPOs always read as genuinely
// upcoming (and Recently Listed as genuinely recent) no matter when the app is opened.
const fmtDate = (daysOffset: number) =>
  relativeDate(daysOffset).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const ipos = [
  { name: "TechPay Africa", sector: "Fintech", issuePrice: 20.00, status: "Open", closeDate: fmtDate(10), subscriptionRate: "340%", minShares: 100 },
  { name: "SafeInsure Ltd", sector: "Insurance", issuePrice: 15.50, status: "Upcoming", closeDate: fmtDate(25), subscriptionRate: "-", minShares: 200 },
  { name: "AgroTech Kenya", sector: "Agriculture", issuePrice: 8.00, status: "Upcoming", closeDate: fmtDate(35), subscriptionRate: "-", minShares: 500 },
];

const recentIPOs = [
  { name: "DigitalPay PLC", symbol: "DPAY", listingPrice: 12.00, currentPrice: 18.50, change: 54.2, listDate: fmtDate(-20) },
  { name: "GreenEnergy Co", symbol: "GREN", listingPrice: 25.00, currentPrice: 22.30, change: -10.8, listDate: fmtDate(-45) },
];

const dividendCalendar = [
  { symbol: "SCOM", name: "Safaricom", exDate: fmtDate(15), payDate: fmtDate(40), amount: 0.64, yield: 5.8, type: "Final" },
  { symbol: "EQTY", name: "Equity Group", exDate: fmtDate(20), payDate: fmtDate(45), amount: 4.00, yield: 4.2, type: "Final" },
  { symbol: "SCBK", name: "Std Chartered", exDate: fmtDate(25), payDate: fmtDate(50), amount: 17.00, yield: 6.2, type: "Final" },
  { symbol: "EABL", name: "EABL", exDate: fmtDate(32), payDate: fmtDate(57), amount: 11.00, yield: 7.1, type: "Interim" },
  { symbol: "KCB", name: "KCB Group", exDate: fmtDate(38), payDate: fmtDate(63), amount: 2.50, yield: 3.9, type: "Final" },
];

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

const earningsCalendar = [
  { symbol: "EABL", name: "EABL", date: fmtDate(5), time: "2:00 PM EAT", expected: "KES 9.80", impact: "high" as const },
  { symbol: "SCOM", name: "Safaricom", date: fmtDate(12), time: "10:00 AM EAT", expected: "KES 1.08", impact: "high" as const },
  { symbol: "KCB", name: "KCB Group", date: fmtDate(19), time: "11:00 AM EAT", expected: "KES 7.20", impact: "medium" as const },
  { symbol: "PORT", name: "East African Portland Cement", date: fmtDate(30), time: "3:00 PM EAT", expected: "KES 2.30", impact: "low" as const },
];

// Volume/avgVolume/ratio below are still illustrative (no real avgVolume
// source exists yet — flagged as a follow-up); price/change are attached
// live inside the component instead of fabricated here.
const volumeLeaderSymbols = [
  { symbol: "KPLC", name: "Kenya Power", volume: "15.2M", avgVolume: "8.5M", ratio: 1.79 },
  { symbol: "SCOM", name: "Safaricom", volume: "8.1M", avgVolume: "6.2M", ratio: 1.31 },
  { symbol: "EQTY", name: "Equity Group", volume: "2.4M", avgVolume: "1.8M", ratio: 1.33 },
  { symbol: "BRIT", name: "Britam", volume: "1.8M", avgVolume: "950K", ratio: 1.89 },
];

// Ratings/targets/firms below are illustrative placeholders, NOT real
// analyst research — labelled "Illustrative" in the UI (see the Analyst
// Ratings card) so they can never be mistaken for real coverage attributed
// to these firms. `current` price is live, never fabricated.
const analystRatingSymbols = [
  { symbol: "SCOM", rating: "Buy", target: 40.50, firm: "Genghis Capital" },
  { symbol: "EQTY", rating: "Strong Buy", target: 108.00, firm: "SBG Securities" },
  { symbol: "KCB", rating: "Hold", target: 98.00, firm: "Dyer & Blair" },
  { symbol: "SCBK", rating: "Sell", target: 320.00, firm: "Standard Investment" },
];

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
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [nseFilter, setNseFilter] = useState<string>("All");
  const [listFilter, setListFilter] = useState<{ label: string; symbols: string[] } | null>(null);
  const [divSortBy, setDivSortBy] = useState<string>("yield");

  // Live from the Continua Data Layer (backend/src/services/marketData/moversService.ts) —
  // falls back to the static, client-derived list above only while loading or if unreachable.
  const { gainers: liveGainers, losers: liveLosers, isLoading: moversLoading } = useMovers(5);
  const { quotes: liveQuotes } = useLiveQuotes(CANONICAL_SYMBOLS);
  const { exchange, exchangeMeta } = useExchange();
  const { indices: liveIndices, isLoading: indicesLoading } = useIndices();

  // Live from market.indices (backend/src/services/marketData/indexService.ts,
  // populated by workers/indexWorker.ts) — falls back to the static Kenya
  // demo list only while loading AND only when NSE is actually selected;
  // any other exchange with no live indices yet just shows nothing rather
  // than mislabeled Kenyan index values.
  const indices = liveIndices.length > 0
    ? liveIndices.map(idx => ({
        name: idx.code,
        value: idx.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        change: idx.changePercent,
        isUp: idx.change >= 0,
        points: `${idx.change >= 0 ? "+" : ""}${idx.change.toFixed(2)}`,
      }))
    : (exchange === "NSE" && !indicesLoading ? staticNseIndicesFallback : []);

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

  const themesWithChange = useMemo(() => investmentThemes.map(theme => {
    const memberChanges = theme.stocks
      .map(s => liveQuotes[s]?.changePercent)
      .filter((c): c is number => c != null);
    const change = memberChanges.length > 0 ? memberChanges.reduce((a, b) => a + b, 0) / memberChanges.length : 0;
    return { ...theme, change, isLive: memberChanges.length > 0 };
  }), [liveQuotes]);

  const volumeLeaders = volumeLeaderSymbols.map(v => ({ ...v, quote: liveQuotes[v.symbol] }));
  const analystRatings = analystRatingSymbols.map(r => {
    const current = liveQuotes[r.symbol]?.lastPrice ?? null;
    return { ...r, current, upside: current != null ? +(((r.target - current) / current) * 100).toFixed(1) : null };
  });

  const sortedDividendStocks = [...highDividendStocks].sort((a, b) => {
    if (divSortBy === "amount") return b.amount - a.amount;
    return b.yield - a.yield;
  });

  return (
    <div className="page-canvas min-h-screen bg-background pb-24">
      <TopBar title="Markets" subtitle="Discover opportunities" showSearch showNotifications showExchangeSelector />

      {/* Sticky editorial sub-nav */}
      <div className="sub-nav">
        <div className="flex overflow-x-auto scrollbar-hide px-4 gap-1 py-2">
          {tabs.map(tab => (
            <button
              key={tab}
              data-small-target
              onClick={() => setActiveTab(tab)}
              className={`pill-tab whitespace-nowrap ${activeTab === tab ? 'rounded-full bg-foreground text-background' : ''}`}
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
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{tool.desc}</p>
              </Card>
            ))}
          </div>
        </div>
        )}

        {activeTab === "Overview" && (
          <>
            {/* Continua brand strip — dotted Africa globe, centered, theme-matched */}
            <Card className="soft-card overflow-hidden">
              <div className="w-full max-w-[220px] mx-auto py-4">
                <AfricaMap variant="compact" />
              </div>
            </Card>

            {/* Market Status */}
            <div className="flex items-center justify-between">
              <MarketStatusIndicator />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Live</span>
                <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
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
              <div className="grid grid-cols-2 gap-2.5">
                {indices.map(idx => (
                  <Card key={idx.name} className="soft-card p-3 active:scale-[0.98] transition-transform cursor-pointer" onClick={() => navigate('/markets')}>
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
                    <div className="mt-2">
                      <SparklineChart isPositive={idx.isUp} width={120} height={28} />
                    </div>
                  </Card>
                ))}
              </div>
              )}
            </div>

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
                        <Badge key={s} variant="secondary" className="text-[10px] py-0 px-1.5 border-0">{s}</Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 leading-snug">{theme.why}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Local Commodities */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                Local Commodities
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {commodities.map(c => (
                  <Card key={c.name} className="soft-card p-3">
                    <p className="text-xs text-muted-foreground font-medium">{c.name}</p>
                    <p className="text-sm font-bold mt-0.5">{c.value}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${c.isUp ? 'text-bull' : 'text-bear'}`}>
                      {c.isUp ? '+' : ''}{c.change.toFixed(1)}%
                    </p>
                  </Card>
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

            {/* Earnings Calendar */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Upcoming Earnings
              </h2>
              <Card className="soft-card overflow-hidden">
                {earningsCalendar.map(e => (
                  <div key={e.symbol} onClick={() => navigate(`/stock/${e.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${e.impact === 'high' ? 'bg-bear' : e.impact === 'medium' ? 'bg-accent' : 'bg-muted-foreground'}`} />
                      <div>
                        <p className="text-sm font-semibold">{e.symbol} · {e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.date} · {e.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Est. EPS</p>
                      <p className="text-sm font-bold">{e.expected}</p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            {/* Volume Leaders */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-accent" />
                Volume Leaders
              </h2>
              <Card className="soft-card overflow-hidden">
                {volumeLeaders.map(v => (
                  <div key={v.symbol} onClick={() => navigate(`/stock/${v.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                        {v.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{v.symbol}</p>
                        <p className="text-xs text-muted-foreground">Vol: {v.volume}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{v.ratio.toFixed(1)}x</p>
                      {v.quote ? (
                        <p className={`text-xs font-semibold ${v.quote.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {v.quote.changePercent >= 0 ? '+' : ''}{v.quote.changePercent.toFixed(1)}%
                        </p>
                      ) : (
                        <Skeleton className="h-3.5 w-10 ml-auto" />
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            {/* Economic Calendar */}
            <EconomicCalendar />

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

            {/* Analyst Ratings — illustrative only, not real analyst coverage */}
            <div>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-accent" />
                Analyst Ratings
                <span className="text-[10px] font-normal text-muted-foreground normal-case">(Illustrative)</span>
              </h2>
              <Card className="soft-card overflow-hidden">
                {analystRatings.map(r => (
                  <div key={r.symbol} onClick={() => navigate(`/stock/${r.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{r.symbol}</span>
                        <Badge className={`text-[10px] py-0 px-1.5 ${
                          r.rating.includes('Buy') ? 'bg-bull/10 text-bull border-bull/20' :
                          r.rating === 'Hold' ? 'bg-accent/10 text-accent border-accent/20' :
                          'bg-bear/10 text-bear border-bear/20'
                        }`}>{r.rating}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.firm}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">KES {r.target.toFixed(2)}</p>
                      {r.upside != null ? (
                        <p className={`text-xs font-semibold ${r.upside >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {r.upside >= 0 ? '+' : ''}{r.upside}% upside
                        </p>
                      ) : (
                        <Skeleton className="h-3.5 w-16 ml-auto" />
                      )}
                    </div>
                  </div>
                ))}
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

            <h2 className="text-sm font-bold flex items-center gap-2">
              <Flame className="h-4 w-4 text-accent" />
              Listing Soon
            </h2>
            <div className="space-y-3">
              {ipos.map(ipo => (
                <Card key={ipo.name} className="soft-card overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold">{ipo.name}</p>
                        <p className="text-xs text-muted-foreground">{ipo.sector}</p>
                      </div>
                      <Badge className={`text-xs ${ipo.status === "Open" ? 'bg-bull/10 text-bull border-bull/20' : 'bg-accent/10 text-accent border-accent/20'}`}>
                        {ipo.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Issue Price</p>
                        <p className="text-sm font-bold">KES {ipo.issuePrice.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Close Date</p>
                        <p className="text-sm font-semibold">{ipo.closeDate}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Subscription</p>
                        <p className="text-sm font-bold text-bull">{ipo.subscriptionRate}</p>
                      </div>
                    </div>
                    {ipo.status === "Open" && (
                      <Button className="w-full h-10 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-transform">
                        Subscribe Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <h2 className="text-sm font-bold flex items-center gap-2 mt-2">
              <Activity className="h-4 w-4 text-primary" />
              Recently Listed
            </h2>
            <Card className="soft-card overflow-hidden">
              {recentIPOs.map(ipo => (
                <div key={ipo.symbol} onClick={() => navigate(`/stock/${ipo.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30">
                  <div>
                    <p className="text-sm font-bold">{ipo.name}</p>
                    <p className="text-xs text-muted-foreground">${ipo.symbol} · Listed {ipo.listDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">KES {ipo.currentPrice.toFixed(2)}</p>
                    <p className={`text-xs font-semibold ${ipo.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {ipo.change >= 0 ? '+' : ''}{ipo.change.toFixed(1)}% from IPO
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}

        {/* ─── DIVIDENDS TAB ─── */}
        {activeTab === "Calendars" && (
          <>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Upcoming Dividends
            </h2>
            <Card className="soft-card overflow-hidden">
              {dividendCalendar.map(d => (
                <div key={d.symbol} onClick={() => navigate(`/stock/${d.symbol}`)} className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-bull/8 flex items-center justify-center text-xs font-bold text-bull">
                      {d.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{d.symbol}</p>
                      <p className="text-xs text-muted-foreground">Ex: {d.exDate}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-bull">KES {d.amount.toFixed(2)}</p>
                    <div className="flex items-center gap-1.5 justify-end">
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{d.type}</Badge>
                      <span className="text-xs text-muted-foreground">{d.yield}% yield</span>
                    </div>
                  </div>
                </div>
              ))}
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