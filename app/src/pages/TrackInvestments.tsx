import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/hooks/usePortfolio";
import { AddInvestmentDialog } from "@/components/portfolio/AddInvestmentDialog";
import { RobinhoodPerformanceChart } from "@/components/portfolio/RobinhoodPerformanceChart";
import { PortfolioSnowflake } from "@/components/portfolio/PortfolioSnowflake";
import { PortfolioInsights } from "@/components/portfolio/PortfolioInsights";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowUpRight, ArrowDownRight, Eye, EyeOff, RefreshCw, ChevronDown, Share,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

import { computePortfolioStats } from "@/lib/stockPrices";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReturnsBreakdown } from "@/components/portfolio/ReturnsBreakdown";
import { ReturnsContributors } from "@/components/portfolio/ReturnsContributors";
import { PortfolioValuations } from "@/components/portfolio/PortfolioValuations";
import { usePortfolioValuations } from "@/hooks/usePortfolioValuations";
import { DividendQuality } from "@/components/portfolio/DividendQuality";
import { DividendCalendar } from "@/components/portfolio/DividendCalendar";
import { DividendForecast } from "@/components/portfolio/DividendForecast";
import { DividendHistory } from "@/components/portfolio/DividendHistory";
import { DividendContributors } from "@/components/portfolio/DividendContributors";
import { usePortfolioDividends } from "@/hooks/usePortfolioDividends";
import { PortfolioRisksRewards } from "@/components/portfolio/PortfolioRisksRewards";
import { KeyMetricsBenchmarks } from "@/components/portfolio/KeyMetricsBenchmarks";
import { PortfolioDiversification } from "@/components/portfolio/PortfolioDiversification";
import { usePortfolioResearch } from "@/hooks/usePortfolioResearch";
import { useMarketBenchmark } from "@/hooks/useMarketBenchmark";
import { PortfolioUpdates } from "@/components/portfolio/PortfolioUpdates";
import { usePortfolioUpdates } from "@/hooks/usePortfolioUpdates";
import { PortfolioScorecard } from "@/components/portfolio/PortfolioScorecard";
import { PortfolioCorrelation } from "@/components/portfolio/PortfolioCorrelation";
import { PortfolioRiskAnalysis } from "@/components/portfolio/PortfolioRiskAnalysis";
import { ShareDilution } from "@/components/portfolio/ShareDilution";
import { usePortfolioGrowth } from "@/hooks/usePortfolioGrowth";
import { usePortfolioRiskAnalytics } from "@/hooks/usePortfolioRiskAnalytics";
import { useLivePortfolioQuotes } from "@/hooks/useLiveQuotes";
import { useProfile } from "@/hooks/useProfile";
import { HoldingsList } from "@/components/portfolio/HoldingsList";
import { PortfolioVisibilityToggles } from "@/components/portfolio/PortfolioVisibilityToggles";
import { SharePortfolioDialog } from "@/components/social/SharePortfolioDialog";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { fx } from "@/lib/chartPalette";

const ALLOC_COLORS = [fx.revenue, fx.netIncome, fx.assets, fx.foreign, fx.liabilities, fx.operatingIncome, fx.eps, fx.retail];

type SortKey = "value" | "gain" | "name";


export default function TrackInvestments() {
  const { portfolio, loading, removeFromPortfolio, refetch } = usePortfolio();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile, updateProfile } = useProfile();
  const isPremium = profile?.subscription_plan === "premium" || profile?.subscription_plan === "premium_plus";
  const [showBalance, setShowBalance] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartPeriod, setChartPeriod] = useState("1M");
  const [chartMode, setChartMode] = useState<"value" | "performance">("value");
  const [allocationMode, setAllocationMode] = useState<"asset" | "sector">("sector");
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null);
  const [privacyPanelOpen, setPrivacyPanelOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Live Continua Data Layer quotes — the SAME quotes HoldingsList (rendered further
  // down) uses internally, so this page's total balance / allocation chart can't disagree
  // with what the individual holding rows show. A position with no live quote yet is
  // excluded from `holdings` (and every derived chart/widget below) rather than priced
  // from a fabricated fallback — see `pricingCount` for a "pricing N more…" note.
  const { liveQuotes } = useLivePortfolioQuotes(portfolio.map(h => h.symbol));
  const getLivePrice = (symbol: string): number | undefined => liveQuotes[symbol.toUpperCase()]?.price;

  const stats = useMemo(() => computePortfolioStats(portfolio, liveQuotes), [portfolio, liveQuotes]);
  const pricingCount = portfolio.length - stats.pricedCount;

  const holdings = useMemo(() => {
    const items = portfolio
      .map(h => {
        const quote = liveQuotes[h.symbol.toUpperCase()];
        if (!quote) return null;
        const price = quote.price;
        const value = price * h.shares;
        const cost = h.avg_cost * h.shares;
        const gain = value - cost;
        const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
        const weight = stats.totalValue > 0 ? (value / stats.totalValue) * 100 : 0;
        const dayChangeAbs = quote.dayChangeAbs;
        const dayChangePct = price - dayChangeAbs > 0 ? (dayChangeAbs / (price - dayChangeAbs)) * 100 : 0;
        return { ...h, price, value, cost, gain, gainPct, weight, dayChangePct };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
    items.sort((a, b) => {
      if (sortBy === "value") return sortAsc ? a.value - b.value : b.value - a.value;
      if (sortBy === "gain") return sortAsc ? a.gainPct - b.gainPct : b.gainPct - a.gainPct;
      return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
    });
    return items;
  }, [portfolio, sortBy, sortAsc, stats.totalValue, liveQuotes]);

  const sectorAlloc = useMemo(() => {
    const map: Record<string, number> = {};
    holdings.forEach(h => {
      const s = h.sector || "Other";
      map[s] = (map[s] || 0) + h.value;
    });
    const colors = ["bg-primary", "bg-accent", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-muted-foreground"];
    return Object.entries(map)
      .map(([name, value], i) => ({ name, value, pct: stats.totalValue > 0 ? (value / stats.totalValue) * 100 : 0, color: colors[i % colors.length] }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, stats.totalValue]);

  const assetAlloc = useMemo(() => {
    return holdings
      .map(h => ({ name: h.symbol, value: h.value, pct: stats.totalValue > 0 ? (h.value / stats.totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, stats.totalValue]);

  const activeAlloc = allocationMode === "asset" ? assetAlloc : sectorAlloc;

  // ── VALUATIONS ──
  // Real, per-symbol model-based fair values (see usePortfolioValuations),
  // fetched in parallel for every distinct holding.
  const { valuations, isLoading: valuationsLoading } = usePortfolioValuations(holdings.map(h => h.symbol));
  const { data: dividendData } = usePortfolioDividends(holdings.map(h => h.symbol));

  // ── RETURNS ──
  // Unrealized P&L is the one figure Continua can compute with full
  // confidence today (live price vs avg cost). Realized P&L and currency
  // effects need closed-lot / multi-currency tracking we don't have yet,
  // so those columns honestly show "No Data" rather than a fabricated
  // number. Dividends use the same real, confirmed trailing-12m payout
  // data (usePortfolioDividends) that Dividend Quality/Forecast/History
  // already render below — not the legacy hardcoded DIV_YIELD table,
  // which never reflects an actual reported payout.
  const dividendIncome = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const d = dividendData[h.symbol.toUpperCase()];
      if (!d) return sum;
      return sum + d.ttmPerShare * h.shares;
    }, 0);
  }, [holdings, dividendData]);
  const { research, isLoading: researchLoading } = usePortfolioResearch(holdings.map(h => h.symbol));
  const { averages: marketBenchmark, isLoading: benchmarkLoading } = useMarketBenchmark();
  const { items: updateItems, recentCounts: updateCounts, isLoading: updatesLoading } = usePortfolioUpdates(holdings.map(h => h.symbol));
  const { growth } = usePortfolioGrowth(holdings.map(h => h.symbol));
  const riskAnalytics = usePortfolioRiskAnalytics(holdings.map(h => ({ symbol: h.symbol, weight: h.weight })));

  const topMovers = useMemo(() => {
    const sorted = [...holdings].sort((a, b) => Math.abs(b.gainPct) - Math.abs(a.gainPct));
    return sorted.slice(0, 3);
  }, [holdings]);

  const diversificationScore = useMemo(() => {
    if (holdings.length === 0) return 0;
    const sectorCount = new Set(holdings.map(h => h.sector || "Other")).size;
    const maxWeight = Math.max(...holdings.map(h => h.weight), 0);
    let score = Math.min(10, sectorCount * 2);
    if (maxWeight > 50) score -= 2;
    else if (maxWeight > 30) score -= 1;
    return Math.max(1, Math.min(10, score));
  }, [holdings]);

  const handleDelete = async (id: string) => {
    const result = await removeFromPortfolio(id);
    if (result.error) toast({ title: "Error", description: "Failed to remove", variant: "destructive" });
    else toast({ title: "Removed", description: "Investment removed" });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) { setSortAsc(!sortAsc); return; }
    setSortBy(key);
    setSortAsc(key === "name"); // A–Z starts ascending; Value/P&L start highest-first
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="page-canvas min-h-screen bg-background pb-24">
      {/* Header — thin, editorial (no back button) */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold">Portfolio</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className={`rounded-full h-9 w-9 ${isRefreshing ? 'animate-spin' : ''}`} onClick={handleRefresh} data-small-target>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setShowBalance(!showBalance)} data-small-target>
              {showBalance ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-6 space-y-8">
        {/* ── HERO — canvas, no card ── */}
        <div>
          <p className="section-eyebrow">Total Value</p>
          <h2 className="mt-1 text-[40px] leading-none font-semibold tabular tracking-tight">
            {showBalance
              ? `KES ${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '••••••'}
          </h2>
          <div className="mt-2 flex items-center gap-2 text-sm tabular">
            <span className={`inline-flex items-center gap-0.5 font-semibold ${stats.totalGain >= 0 ? 'text-bull' : 'text-bear'}`}>
              {stats.totalGain >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {showBalance && (
                <>{stats.totalGain >= 0 ? '+' : '−'}KES {Math.abs(stats.totalGain).toFixed(2)} </>
              )}
              <span className="opacity-80 ml-1">({stats.gainPct >= 0 ? '+' : ''}{stats.gainPct.toFixed(2)}%)</span>
            </span>
            <span className="text-muted-foreground text-xs">All time</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 hairline-t pt-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today</p>
              <p className={`mt-0.5 text-sm font-semibold tabular ${stats.todayGain >= 0 ? 'text-bull' : 'text-bear'}`}>
                {showBalance ? `${stats.todayGain >= 0 ? '+' : '−'}${Math.abs(stats.todayGain).toFixed(0)}` : '••'}
              </p>
              <p className={`text-[10px] tabular ${stats.todayPct >= 0 ? 'text-bull' : 'text-bear'}`}>{stats.todayPct >= 0 ? '+' : ''}{stats.todayPct.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Invested</p>
              <p className="mt-0.5 text-sm font-semibold tabular">{showBalance ? `KES ${stats.totalCost.toFixed(0)}` : '••'}</p>
              <p className="text-[10px] text-muted-foreground">{holdings.length} stocks</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Diversification</p>
              <p className="mt-0.5 text-sm font-semibold tabular">{diversificationScore}/10</p>
              <p className="text-[10px] text-muted-foreground">{sectorAlloc.length} sectors</p>
            </div>
          </div>
          {pricingCount > 0 && (
            <p className="mt-3 text-[10px] text-muted-foreground text-center">
              Pricing {pricingCount} more position{pricingCount === 1 ? "" : "s"}…
            </p>
          )}
        </div>

        {/* ── PERFORMANCE CHART — Robinhood-clean, no side prices ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1 bg-muted/50 rounded-full p-0.5">
              <button
                data-small-target
                className={`text-[10px] rounded-full h-6 px-3 font-semibold transition-colors ${chartMode === 'value' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => setChartMode('value')}
              >Value</button>
              <button
                data-small-target
                className={`text-[10px] rounded-full h-6 px-3 font-semibold transition-colors ${chartMode === 'performance' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => setChartMode('performance')}
              >Performance</button>
            </div>
          </div>
          <div className="-mx-4">
            <RobinhoodPerformanceChart
              totalValue={stats.totalValue}
              totalCost={stats.totalCost}
              dayStartValue={stats.totalValue - stats.todayGain}
              mode={chartMode}
              hideValue={!showBalance}
              seed={holdings.map(h => h.symbol).join(',')}
            />
          </div>
        </div>

        {/* ── PORTFOLIO HEALTH ── */}
        <PortfolioSnowflake
          holdings={holdings}
          totalValue={stats.totalValue}
          totalCost={stats.totalCost}
          gainPct={stats.gainPct}
        />

        <PortfolioRisksRewards
          holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name }))}
          research={research}
          valuations={valuations}
          benchmark={marketBenchmark}
          dividendData={dividendData}
        />

        <PortfolioInsights holdings={portfolio} prices={Object.fromEntries(portfolio.map(h => [h.symbol, getLivePrice(h.symbol)]).filter(([, p]) => p != null) as [string, number][])} />

        {/* ── HOLDINGS / RETURNS ── */}
        <Tabs defaultValue="holdings">
          <TabsList className="w-full flex overflow-x-auto scrollbar-hide gap-5 h-10 bg-transparent p-0 justify-start border-b border-border rounded-none">
            <TabsTrigger value="holdings" className="shrink-0 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 text-[12.5px] font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors">Holdings</TabsTrigger>
            <TabsTrigger value="returns" className="shrink-0 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 text-[12.5px] font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors">Returns</TabsTrigger>
            <TabsTrigger value="valuations" className="shrink-0 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 text-[12.5px] font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors">Valuations</TabsTrigger>
            <TabsTrigger value="updates" className="shrink-0 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 text-[12.5px] font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors">Updates</TabsTrigger>
            <TabsTrigger value="dividends" className="shrink-0 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 text-[12.5px] font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors">Dividends</TabsTrigger>
            <TabsTrigger value="analysis" className="shrink-0 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 text-[12.5px] font-semibold text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors">Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="updates" className="mt-4 space-y-4">
            {holdings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold">No positions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add an investment to see earnings, dividends, and filings.</p>
              </div>
            ) : (
              <PortfolioUpdates items={updateItems} recentCounts={updateCounts} isLoading={updatesLoading} />
            )}
          </TabsContent>

          <TabsContent value="analysis" className="mt-4 space-y-4">
            {holdings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold">No positions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add an investment to see benchmarks and diversification.</p>
              </div>
            ) : (
              <>
                <PortfolioScorecard
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, weight: h.weight }))}
                  research={research}
                  valuations={valuations}
                  benchmark={marketBenchmark}
                  dividendData={dividendData}
                />
                <KeyMetricsBenchmarks
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, value: h.value, weight: h.weight, price: h.price, avgCost: h.avg_cost, shares: h.shares }))}
                  research={research}
                  valuations={valuations}
                  growth={growth}
                  dividendData={dividendData}
                  benchmark={marketBenchmark}
                  isLoading={researchLoading || benchmarkLoading}
                />
                <PortfolioDiversification
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, sector: h.sector, value: h.value }))}
                  showValues={showBalance}
                />
                <PortfolioCorrelation
                  pairs={riskAnalytics.pairs}
                  symbols={riskAnalytics.symbolsWithData}
                  isLoading={riskAnalytics.isLoading}
                  hasEnoughData={riskAnalytics.hasEnoughData}
                />
                <PortfolioRiskAnalysis
                  holdings={holdings.map(h => ({ symbol: h.symbol, weight: h.weight }))}
                  risk={riskAnalytics}
                />
                <ShareDilution
                  holdings={holdings.map(h => ({ symbol: h.symbol, weight: h.weight }))}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="dividends" className="mt-4 space-y-4">
            {holdings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold">No positions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add an investment to track dividend income.</p>
              </div>
            ) : (
              <>
                <DividendHistory
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, shares: h.shares }))}
                  dividendData={dividendData}
                  isPremium={isPremium}
                  showValues={showBalance}
                />
                <DividendContributors
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, shares: h.shares }))}
                  dividendData={dividendData}
                  isPremium={isPremium}
                  showValues={showBalance}
                />
                <DividendQuality
                  holdings={holdings.map(h => ({ id: h.id, symbol: h.symbol, name: (h as any).name, shares: h.shares, price: h.price, avgCost: h.avg_cost }))}
                  dividendData={dividendData}
                  showValues={showBalance}
                />
                <DividendForecast
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, shares: h.shares }))}
                  dividendData={dividendData}
                  isPremium={isPremium}
                  showValues={showBalance}
                />
                <DividendCalendar
                  holdings={holdings.map(h => ({ symbol: h.symbol, shares: h.shares }))}
                  dividendData={dividendData}
                  showValues={showBalance}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="valuations" className="mt-4">
            {holdings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold">No positions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add an investment to see fair-value estimates.</p>
              </div>
            ) : (
              <PortfolioValuations
                holdings={holdings.map(h => ({ id: h.id, symbol: h.symbol, name: (h as any).name, shares: h.shares, price: h.price, value: h.value }))}
                valuations={valuations}
                isLoading={valuationsLoading}
                showValues={showBalance}
              />
            )}
          </TabsContent>

          <TabsContent value="returns" className="mt-4 space-y-4">
            {holdings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold">No positions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add an investment to see your returns breakdown.</p>
              </div>
            ) : (
              <>
                <ReturnsBreakdown
                  unrealized={stats.totalGain}
                  dividends={dividendIncome}
                  realized={null}
                  currency={null}
                  showValues={showBalance}
                />
                <ReturnsContributors
                  holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name, amount: h.gain, gainPct: h.gainPct }))}
                  showValues={showBalance}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="holdings" className="mt-4 space-y-8">

        {/* ── ALLOCATION ── */}
        {activeAlloc.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-small-target className="flex items-center gap-1 section-eyebrow">
                    {allocationMode === "asset" ? "Asset allocation" : "Sector allocation"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => { setAllocationMode("asset"); setSelectedSlice(null); }}>Asset allocation</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setAllocationMode("sector"); setSelectedSlice(null); }}>Sector allocation</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="h-52 mt-2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activeAlloc}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="none"
                    onClick={(_, i) => setSelectedSlice(prev => prev === activeAlloc[i].name ? null : activeAlloc[i].name)}
                  >
                    {activeAlloc.map((s, i) => {
                      const color = ALLOC_COLORS[i % ALLOC_COLORS.length];
                      const isSelected = selectedSlice === s.name;
                      const dimmed = selectedSlice !== null && !isSelected;
                      return (
                        <Cell
                          key={s.name}
                          fill={color}
                          opacity={dimmed ? 0.3 : 1}
                          style={{
                            cursor: "pointer",
                            filter: isSelected ? `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 3px ${color})` : undefined,
                            transition: "opacity 150ms ease, filter 150ms ease",
                          }}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center readout — driven purely by `selectedSlice`, so tapping a
                  slice on the chart or a row in the list below shows the exact
                  same thing here. No reliance on Recharts' hover-only Tooltip,
                  which is why list taps used to show nothing. */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center px-6">
                  {(() => {
                    const sel = selectedSlice ? activeAlloc.find(s => s.name === selectedSlice) : null;
                    if (sel) {
                      return (
                        <>
                          <p className="text-[11px] font-medium text-muted-foreground truncate max-w-[130px] mx-auto">{sel.name}</p>
                          <p className="mt-0.5 text-lg font-bold tabular">
                            {showBalance ? `KES ${sel.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '••••'}
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular">{sel.pct.toFixed(1)}%</p>
                        </>
                      );
                    }
                    return (
                      <>
                        <p className="text-[11px] font-medium text-muted-foreground">Total</p>
                        <p className="mt-0.5 text-lg font-bold tabular">
                          {showBalance ? `KES ${stats.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '••••'}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="mt-1">
              {activeAlloc.map((s, i) => {
                const isSelected = selectedSlice === s.name;
                return (
                  <button
                    key={s.name}
                    data-small-target
                    onClick={() => setSelectedSlice(prev => prev === s.name ? null : s.name)}
                    className={`w-full flex items-center gap-2.5 py-2.5 border-b border-border/50 last:border-0 text-left transition-colors ${isSelected ? "bg-muted/40 -mx-1 px-1 rounded-lg" : ""}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length], boxShadow: isSelected ? `0 0 6px ${ALLOC_COLORS[i % ALLOC_COLORS.length]}` : undefined }}
                    />
                    <span className={`text-[12px] flex-1 truncate ${isSelected ? "font-semibold" : ""}`}>{s.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular">
                      {showBalance ? `KES ${s.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '••••'}
                    </span>
                    <span className="text-[12px] font-semibold tabular w-14 text-right">{s.pct.toFixed(1)}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}


        {/* ── HOLDINGS ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-eyebrow">Holdings · {holdings.length}</p>
            <div className="flex gap-1">
              {([["name", "A–Z"], ["value", "Value"], ["gain", "P/L"]] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  data-small-target
                  className={`text-[10px] font-semibold px-2.5 h-6 rounded-full transition-colors ${sortBy === key ? 'brand-active' : 'text-muted-foreground'}`}
                  onClick={() => toggleSort(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {holdings.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold">No positions yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Add your first investment to start tracking.</p>
              <AddInvestmentDialog />
            </div>
          ) : (
            <>
              <HoldingsList holdings={portfolio} showValues={showBalance} onRemove={handleDelete} />

              {/* ── SHARING & PRIVACY ── same settings Settings → Privacy & safety
                  writes to, kept right here too since this is where holdings live. */}
              <div className="mt-5 pt-4 border-t border-border/50">
                <button
                  data-small-target
                  onClick={() => setPrivacyPanelOpen(o => !o)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <p className="text-[12px] font-semibold">Sharing & privacy</p>
                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                      {profile?.portfolio_public ? "Your portfolio is visible to others" : "Your portfolio is private"}
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${privacyPanelOpen ? "rotate-180" : ""}`} />
                </button>

                {privacyPanelOpen && (
                  <div className="mt-4 animate-fade-in">
                    <PortfolioVisibilityToggles
                      compact
                      value={{
                        portfolioPublic: !!profile?.portfolio_public,
                        hideAmounts: !!profile?.portfolio_hide_amounts,
                        hideGains: !!profile?.portfolio_hide_gains,
                        topHoldingsOnly: !!profile?.portfolio_top_holdings_only,
                        followersOnly: !!profile?.portfolio_followers_only,
                      }}
                      onChange={(next) => {
                        updateProfile({
                          portfolio_public: next.portfolioPublic,
                          portfolio_hide_amounts: next.hideAmounts,
                          portfolio_hide_gains: next.hideGains,
                          portfolio_top_holdings_only: next.topHoldingsOnly,
                          portfolio_followers_only: next.followersOnly,
                        });
                      }}
                    />
                  </div>
                )}

                <Button
                  className="w-full rounded-full h-11 font-bold btn-primary mt-4"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share className="h-4 w-4 mr-2" />Share Portfolio
                </Button>
              </div>
            </>
          )}
        </div>

        <SharePortfolioDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          holdings={holdings.map(h => ({ symbol: h.symbol, name: (h as any).name || h.symbol, shares: h.shares, currentPrice: h.price, avgCost: h.avg_cost, dayChangePct: h.dayChangePct, gainPct: h.gainPct }))}
          totalValue={stats.totalValue}
          totalGain={stats.totalGain}
          gainPercent={stats.gainPct}
          todayGain={stats.todayGain}
          todayPercent={stats.todayPct}
          defaults={{
            hideAmounts: !!profile?.portfolio_hide_amounts,
            hideGains: !!profile?.portfolio_hide_gains,
            topHoldingsOnly: !!profile?.portfolio_top_holdings_only,
          }}
        />

        {/* ── INSIGHTS ── */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="section-eyebrow">Portfolio movers</p>
              <div className="mt-2">
                {topMovers.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-[12px] font-semibold">{m.symbol}</span>
                    <span className={`text-[12px] font-semibold tabular ${m.gain >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {m.gain >= 0 ? '+' : ''}{m.gainPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="section-eyebrow">Diversification</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[28px] leading-none font-semibold tabular">{diversificationScore}</span>
                <span className="text-[11px] text-muted-foreground">/10</span>
              </div>
              <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-foreground/70" style={{ width: `${diversificationScore * 10}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {diversificationScore >= 7 ? 'Well balanced across sectors' : diversificationScore >= 4 ? 'Moderately diversified' : 'Concentrated — consider spreading risk'}
              </p>
            </div>
          </div>
        )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}