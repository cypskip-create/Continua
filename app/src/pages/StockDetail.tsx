import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, TrendingUp, TrendingDown, AlarmClock, GitCompare, MessageSquare, Plus, Pencil, Maximize2, Minimize2, CandlestickChart, LineChart as LineChartIcon, AreaChart as AreaChartIcon, ChevronRight, ChevronDown, FileText, Users2, Briefcase, Download, Building2, Eye, Bell, SlidersHorizontal, Crosshair, LayoutGrid, Expand, Shrink, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StockPriceChart, generateMockData, type ChartType } from "@/components/stock/StockPriceChart";
import { ChartIndicatorsSheet } from "@/components/stock/ChartIndicatorsSheet";
import { DrawingToolsSheet } from "@/components/stock/DrawingToolsSheet";
import { type DrawToolId } from "@/lib/drawingTools";
import { anyIndicatorsOn, loadIndicatorSettings, saveIndicatorSettings, type IndicatorSettings } from "@/lib/technicalIndicators";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWatchlist } from "@/hooks/useWatchlist";
import { AddToWatchlistDialog } from "@/components/markets/AddToWatchlistDialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { PriceAlertsManager } from "@/components/alerts/PriceAlertsManager";
import { StockAlertDialog } from "@/components/alerts/StockAlertDialog";
import { usePortfolio } from "@/hooks/usePortfolio";
import { AddInvestmentDialog } from "@/components/portfolio/AddInvestmentDialog";
import { ContinuaScoreCard, computeScores } from "@/components/stock/ContinuaScore";
import { AIThesisCard } from "@/components/stock/AIThesisCard";
import { getFundamentals } from "@/data/stockFundamentals";
import { STOCK_META, DIV_YIELD, getStockFundamentals } from "@/lib/stockPrices";
import { Skeleton } from "@/components/ui/skeleton";
import { ValuationSection } from "@/components/stock/report/ValuationSection";
import { FutureGrowthSection } from "@/components/stock/report/FutureGrowthSection";
import { PastPerformanceSection } from "@/components/stock/report/PastPerformanceSection";
import { FinancialHealthSection } from "@/components/stock/report/FinancialHealthSection";
import { RiskSection } from "@/components/stock/report/RiskSection";
import { DividendsSection } from "@/components/stock/report/DividendsSection";
import { ManagementSection } from "@/components/stock/report/ManagementSection";
import { OwnershipSection } from "@/components/stock/report/OwnershipSection";
import { CompanyInfoSection } from "@/components/stock/report/CompanyInfoSection";
import { TechnicalsTab } from "@/components/stock/tabs/TechnicalsTab";
import { NewsEventsTab } from "@/components/stock/tabs/NewsEventsTab";
import { CommunityTab } from "@/components/stock/tabs/CommunityTab";
import { ScoresTab } from "@/components/stock/tabs/ScoresTab";
import { StockSnowflake } from "@/components/stock/tabs/StockSnowflake";
import { useSecurityNews } from "@/hooks/useSecurityNews";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useLiveQuote } from "@/hooks/useLiveQuotes";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useResearch } from "@/hooks/useResearch";
import { useHistoricalCandles } from "@/hooks/useHistoricalCandles";
import { useDividendHistory } from "@/hooks/useDividendHistory";
import { useOwnership } from "@/hooks/useOwnership";
import { useCorporateActions } from "@/hooks/useCorporateActions";
import { useExchange } from "@/hooks/useExchange";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ContinuaScores } from "@/components/stock/ContinuaScore";


// Price, change, sector, and key stats all come from the shared stockPrices.ts source
// (the same one Markets, the Screener, Compare, and AllStocksList read from) so this page
// can never show a different number than the list the person tapped through from — and
// every NSE symbol in STOCK_META gets real stats here instead of falling back to "N/A".

const companyInfo: Record<string, { description: string; headquarters: string; ceo: string; employees: string; founded: string }> = {
  SCOM: { description: "Safaricom PLC is Kenya's largest mobile network operator, best known for M-Pesa mobile money, voice, data and fibre.", headquarters: "Nairobi, Kenya", ceo: "Peter Ndegwa", employees: "6,500+", founded: "1997" },
  EQTY:   { description: "Equity Group Holdings is a leading pan-African financial services group offering banking, insurance and investment products across seven markets.", headquarters: "Nairobi, Kenya", ceo: "James Mwangi", employees: "15,000+", founded: "1984" },
  KCB:    { description: "KCB Group is the largest commercial bank in East Africa by assets, serving retail, corporate and government clients across the region.", headquarters: "Nairobi, Kenya", ceo: "Paul Russo", employees: "10,000+", founded: "1896" },
  EABL:   { description: "East African Breweries produces and distributes beer and spirits including Tusker, Guinness and Bell across East Africa.", headquarters: "Nairobi, Kenya", ceo: "Jane Karuku", employees: "4,000+", founded: "1922" },
};

type SubSection = "overview" | "research" | "news" | "community" | "more";

const SUB_NAV: { id: SubSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "research", label: "Research" },
  { id: "news", label: "News" },
  { id: "community", label: "Community" },
  { id: "more", label: "More" },
];

// The nested jump-nav inside the Research section (Snowflake, then the
// numbered report sections) — a level below SUB_NAV above.
const REPORT_JUMP_NAV: { id: string; label: string }[] = [
  { id: "rpt-snowflake", label: "Snowflake" },
  { id: "rpt-1", label: "1. Valuation" },
  { id: "rpt-2", label: "2. Future Growth" },
  { id: "rpt-3", label: "3. Past Performance" },
  { id: "rpt-4", label: "4. Financial Health" },
  { id: "rpt-5", label: "5. Risk" },
  { id: "rpt-6", label: "6. Dividend" },
  { id: "rpt-7", label: "7. Management" },
  { id: "rpt-8", label: "8. Ownership" },
  { id: "rpt-9", label: "9. Company Info" },
  { id: "rpt-technicals", label: "Technicals" },
];

export default function StockDetail() {
  const { exchangeMeta } = useExchange();
  const navigate = useNavigate();
  const { symbol } = useParams();
  const [selectedTimeframe, setSelectedTimeframe] = useState("1D");
  const [chartType, setChartType] = useState<ChartType>("area");
  const [fullscreen, setFullscreen] = useState(false);
  // Fullscreen chart toolbar (Moomoo/TradingView-style) — period picker plus
  // crosshair-pin, draw, gridline, and immersive toggles. Kept separate from
  // the embedded card chart's state, which doesn't expose any of this. The
  // actual drawing engine (all the Lines/Channels & Pitchforks/Shapes/
  // Measures/Items tools, anchored to real price/time so they survive axis
  // zoom) lives inside StockPriceChart itself; this page just tracks which
  // tool is selected, whether anything's been drawn (to show/hide the clear
  // button), and bumps `fsClearDrawSignal` to ask the chart to clear.
  const [fsPeriodMenuOpen, setFsPeriodMenuOpen] = useState(false);
  const [fsCrosshairPinned, setFsCrosshairPinned] = useState(false);
  const [drawToolsSheetOpen, setDrawToolsSheetOpen] = useState(false);
  const [fsActiveDrawTool, setFsActiveDrawTool] = useState<DrawToolId | null>(null);
  const [fsHasDrawings, setFsHasDrawings] = useState(false);
  const [fsDrawingsHidden, setFsDrawingsHidden] = useState(false);
  const [fsClearDrawSignal, setFsClearDrawSignal] = useState(0);
  const [fsShowGrid, setFsShowGrid] = useState(false);
  const [fsImmersive, setFsImmersive] = useState(false);
  const [showAlertsDialog, setShowAlertsDialog] = useState(false);
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [section, setSection] = useState<SubSection>("overview");
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const { portfolio } = usePortfolio();
  const { toast } = useToast();

  const myHolding = portfolio.find(p => p.symbol.toUpperCase() === (symbol || "").toUpperCase());

  const upperSymbol = (symbol || "").toUpperCase();
  const stockMeta = STOCK_META[upperSymbol];

  // Live Continua Data Layer quote for this symbol, when it's in the
  // Data Layer's current universe (see docs/api/API.md /instruments) —
  // overlaid onto the static reference stats below so this page shows the
  // same live price as Watchlist/Markets, and falls back gracefully
  // (rather than erroring) for a symbol the backend doesn't cover yet.
  const { quote: liveQuote } = useLiveQuote(upperSymbol || undefined);
  const { profile: liveProfile } = useCompanyProfile(upperSymbol || undefined);
  const { research: liveResearch } = useResearch(upperSymbol || undefined);
  const { actions: corporateActions, isLoading: actionsLoading } = useCorporateActions(upperSymbol || undefined);
  const [infoSheet, setInfoSheet] = useState<{ title: string; body: React.ReactNode } | null>(null);
  // Indicator choices are a chart preference, not a per-stock one — they're loaded
  // from (and saved to) localStorage so switching stocks, or reloading, keeps
  // whatever was last turned on until the person switches it off themselves.
  const [indicatorSettings, setIndicatorSettingsState] = useState<IndicatorSettings>(loadIndicatorSettings);
  const setIndicatorSettings = useCallback((next: IndicatorSettings) => {
    setIndicatorSettingsState(next);
    saveIndicatorSettings(next);
  }, []);
  const [indicatorsSheetOpen, setIndicatorsSheetOpen] = useState(false);

  const stock = stockMeta ? (() => {
    const f = getStockFundamentals(upperSymbol);
    // price/change/pct come ONLY from the live quote — 0 here is a neutral
    // loading placeholder for internal math (chart scrubbing etc.), never
    // shown directly: every JSX spot that renders these renders a loading
    // skeleton instead while isLive is false. No fabricated fallback.
    const price = liveQuote?.lastPrice ?? 0;
    const change = liveQuote?.change ?? 0;
    const pct = liveQuote?.changePercent ?? 0;
    const dividend = +(price * ((DIV_YIELD[upperSymbol] ?? 0) / 100)).toFixed(2);
    const eps = f.pe > 0 ? +(price / f.pe).toFixed(2) : 0;
    return {
      name: stockMeta.name, price, change, changePercent: pct.toFixed(2), isUp: change >= 0,
      marketCap: liveQuote?.marketCap ? String(liveQuote.marketCap) : null,
      pe: f.pe.toFixed(1), eps: eps.toFixed(2), dividend: dividend.toFixed(2),
      high52: (price * 1.12).toFixed(2), low52: (price * 0.85).toFixed(2),
      exchange: "NSE", sector: stockMeta.sector,
      volume: liveQuote?.volume ?? null, beta: f.beta.toFixed(2), avgVolume: f.avgVolume,
      isLive: !!liveQuote,
    };
  })() : {
    name: symbol || "Unknown Stock", price: 0, change: 0, changePercent: "0.00", isUp: true,
    marketCap: null, pe: "N/A", eps: "N/A", dividend: "N/A", high52: "N/A", low52: "N/A",
    exchange: "NSE", sector: "Unknown", volume: null, beta: "N/A", avgVolume: "N/A", isLive: false
  };

  const company = liveProfile
    ? {
        description: liveProfile.company.description || `${stockMeta?.name ?? symbol} is listed on the Nairobi Securities Exchange.`,
        headquarters: liveProfile.company.headquarters || "Nairobi, Kenya",
        ceo: liveProfile.company.ceo || "N/A",
        employees: liveProfile.company.employees || "N/A",
        founded: liveProfile.company.founded || "N/A",
      }
    : companyInfo[symbol as keyof typeof companyInfo] || {
        description: `${stock.name} is listed on the Nairobi Securities Exchange in the ${stock.sector} sector.`,
        headquarters: "Nairobi, Kenya", ceo: "N/A", employees: "N/A", founded: "N/A"
      };

  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);

  const handleWatchlistToggle = async () => {
    if (!symbol) return;
    // Always route through the picker so the person chooses (or confirms)
    // which watchlist the stock goes into -- consistent whether they're
    // adding for the first time or already have it saved somewhere.
    setWatchlistDialogOpen(true);
  };

  // Hover state for period change calculations
  const [hoverChangePercent, setHoverChangePercent] = useState<number | null>(null);
  const [hoverIsUp, setHoverIsUp] = useState<boolean | null>(null);

  // Enhanced hover handler that also captures change % relative to period start
  const handleChartHover = useCallback((price: number | null, date: string | null, changePercent?: number | null, isUp?: boolean | null) => {
    setHoverPrice(price);
    setHoverDate(date);
    setHoverChangePercent(changePercent ?? null);
    setHoverIsUp(isUp ?? null);
  }, []);

  // Pencil tool: opens the Drawing Tools sheet; picking a tool there sets
  // `fsActiveDrawTool`, which StockPriceChart reads to start collecting taps
  // for that tool. The actual drawing/anchoring lives in that component; this
  // page only needs to know which tool is active, whether to show the "clear
  // drawings" trash icon, and how to ask the chart to clear everything.
  const fsSelectDrawTool = useCallback((tool: DrawToolId) => setFsActiveDrawTool(tool), []);
  const fsClearDrawings = useCallback(() => setFsClearDrawSignal((n) => n + 1), []);
  const fsToggleHideDrawings = useCallback(() => setFsDrawingsHidden((v) => !v), []);

  // Leaving fullscreen resets its toolbar toggles, so reopening it always
  // starts from the same clean state rather than remembering, say, an
  // immersive/hidden header from last time. (StockPriceChart unmounts along
  // with this view, so its drawings are already gone — this just keeps the
  // toolbar's own state in sync.)
  useEffect(() => {
    if (!fullscreen) {
      setFsActiveDrawTool(null);
      setFsHasDrawings(false);
      setFsDrawingsHidden(false);
      setFsShowGrid(false);
      setFsCrosshairPinned(false);
      setFsImmersive(false);
      setDrawToolsSheetOpen(false);
    }
  }, [fullscreen]);

  const timeframes = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];
  const timeframeLabels: Record<string, string> = {
    "1D": "Today", "1W": "Past week", "1M": "Past month", "3M": "Past 3 months",
    "YTD": "Year to date", "1Y": "Past year", "ALL": "All time",
  };
  // dividendYield from the Data Layer's ratios engine is a raw fraction
  // (e.g. 0.0493), not a percentage — see backend/src/services/research/ratiosEngine.ts.
  const divYield = liveResearch?.ratios.dividendYield != null
    ? (liveResearch.ratios.dividendYield * 100).toFixed(1)
    : stock.pe !== "N/A" ? ((parseFloat(stock.dividend) / stock.price) * 100).toFixed(1) : "0.0";

  // Gain/loss for the whole selected timeframe — first vs. last point of that period's
  // series. This is the same series the chart itself renders, so the header numbers and
  // the chart's red/green always agree, and both update when the timeframe pill changes.
  // Real daily candles from the Data Layer when available (every timeframe except "1D" —
  // see useHistoricalCandles for why); falls back to the existing generated series
  // otherwise, so the chart never goes blank while data loads or for an uncovered symbol.
  const { points: liveCandlePoints } = useHistoricalCandles(upperSymbol || undefined, selectedTimeframe);
  const mockPeriodData = useMemo(() => generateMockData(selectedTimeframe, symbol || "STK"), [selectedTimeframe, symbol]);
  const periodData = liveCandlePoints.length > 1 ? liveCandlePoints : mockPeriodData;
  const periodFirstPrice = periodData[0]?.price || stock.price;
  const periodLastPrice = periodData[periodData.length - 1]?.price || stock.price;
  // "1D" isn't backed by real intraday candles yet (see useHistoricalCandles),
  // so its chart line is a generated mock shape — it must never be the source
  // of the day's % change, or this header disagrees with the real day change
  // shown everywhere else (sticky header, portfolio rows, etc). Use the live
  // quote's actual change for 1D; every other timeframe still derives its
  // change from that timeframe's own (real) first/last price.
  const periodChangePercent = selectedTimeframe === "1D"
    ? Number(stock.changePercent)
    : (periodFirstPrice ? ((periodLastPrice - periodFirstPrice) / periodFirstPrice) * 100 : 0);
  const periodIsUp = selectedTimeframe === "1D" ? stock.isUp : periodLastPrice >= periodFirstPrice;

  // While scrubbing the chart, show change vs. the start of the selected period instead;
  // otherwise show the full period's change. Percent is scaled onto the real quoted price
  // (mock series lives on its own price scale) so the KES amount shown stays consistent
  // with the price displayed elsewhere on the page.
  const isScrubbing = hoverPrice !== null && hoverChangePercent !== null;
  const activeChangePercent = isScrubbing ? hoverChangePercent! : periodChangePercent;
  const activeIsUp = isScrubbing && hoverIsUp !== null ? hoverIsUp : periodIsUp;
  const priceChange = stock.price * (activeChangePercent / 100);
  const priceChangePercent = activeChangePercent.toFixed(2);
  const displayIsUp = activeIsUp;
  // The big hero number is always the CURRENT market price — switching the timeframe
  // pill (1D/1W/1M/...) only changes the period's KES/% move shown underneath it, never
  // the price itself. The only time the number under the finger should actually move is
  // while the person is dragging a finger/cursor along the chart (scrubbing), where it
  // reflects the price at that specific point in history. Release the drag (or just tap
  // a different timeframe pill) and it snaps straight back to the live quote.
  const displayPrice = isScrubbing ? stock.price + priceChange : stock.price;

  // stock.changePercent is stored as a pre-formatted string (see the `stock` object
  // above, built with `.toFixed(2)`), not a number — so it needs to be coerced to a
  // number before it can be compared with `>= 0`. This is used for the collapsed
  // sticky-header price row, which always shows the day's change regardless of the
  // active timeframe pill.
  const dayChangeNum = Number(stock.changePercent);
  const dayChangeIsUp = dayChangeNum >= 0;

  const scoreInputs = {
    price: stock.price, pe: stock.pe, eps: stock.eps, dividend: stock.dividend,
    changePercent: stock.changePercent, beta: stock.beta,
    high52: stock.high52, low52: stock.low52, marketCap: stock.marketCap,
  };
  // Prefer the Data Layer's own AfriScore calculation
  // (backend/src/services/research/afriScoreService.ts) when this symbol is
  // covered; otherwise fall back to the client-side heuristic estimate so
  // the card still renders something for symbols outside the current
  // backend universe.
  const scores: ContinuaScores = liveResearch
    ? {
        value: liveResearch.score.afriValue,
        growth: liveResearch.score.afriGrowth,
        health: liveResearch.score.afriHealth,
        dividend: liveResearch.score.afriIncome,
        risk: liveResearch.score.afriRisk,
        position: liveResearch.score.afriMomentum,
        overall: liveResearch.score.afriScore,
      }
    : computeScores(scoreInputs);
  const fundamentals = getFundamentals(symbol || "", stock.price);

  // Overlay real Data Layer data onto specific fields of the (otherwise
  // synthetic) fundamentals bundle, wherever the backend actually has a
  // data source for that field. Fields the backend doesn't compute yet
  // (analyst targets, insider trades, revenue segments, Piotroski/Altman Z,
  // etc. — see docs/architecture/FRONTEND_INTEGRATION.md) are left as-is
  // rather than fabricated, so the research tabs stay useful without
  // silently mixing invented numbers into what looks like real disclosure.
  const { history: liveDividendHistory } = useDividendHistory(upperSymbol || undefined);
  const { ownership: liveOwnership, topShareholders: liveTopShareholders, isLoading: ownershipLoading } = useOwnership(upperSymbol || undefined);
  const liveFundamentals = {
    ...fundamentals,
    dividendHistory: liveDividendHistory.length > 0 ? liveDividendHistory : fundamentals.dividendHistory,
    // ratios.payoutRatio from the Data Layer is a raw fraction (e.g. 0.42),
    // but Fundamentals.payoutRatio is a whole-number percent — same unit
    // mismatch as dividendYield above.
    payoutRatio: liveResearch?.ratios.payoutRatio != null ? liveResearch.ratios.payoutRatio * 100 : fundamentals.payoutRatio,
  };
  // "Recent News" preview + NewsEventsTab both use real scraped news for
  // this symbol now — see useSecurityNews.ts. Opens externally since only
  // an excerpt is stored, not the full article body (see NewsItem type).
  const { news: stockNews } = useSecurityNews(upperSymbol || undefined);

  // Section refs — sticky sub-nav scrolls to them
  const refs = {
    overview: useRef<HTMLDivElement>(null),
    research: useRef<HTMLDivElement>(null),
    news: useRef<HTMLDivElement>(null),
    community: useRef<HTMLDivElement>(null),
    more: useRef<HTMLDivElement>(null),
  };
  const scrollTo = (id: SubSection) => {
    setSection(id);
    refs[id].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.section as SubSection;
          if (id) setSection(id);
        }
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    Object.values(refs).forEach(r => r.current && observer.observe(r.current));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll spy for the nested report jump-nav (Snowflake, 1. Valuation, …) —
  // same idea as the top-level scroll spy above, one level down.
  const [reportSection, setReportSection] = useState<string>("rpt-snowflake");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setReportSection(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    const els = REPORT_JUMP_NAV.map(({ id }) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether the hero price (above the chart) is still on screen. The sticky
  // header's price/change block only appears once this goes false — i.e.
  // once the person has actually scrolled the hero price out of view —
  // rather than sitting there permanently.
  const [priceVisible, setPriceVisible] = useState(true);
  const heroPriceRef = useRef<HTMLDivElement>(null);
  const STICKY_HEADER_HEIGHT = 53; // matches the header's own height (see sticky top-[53px] sub-nav below)

  useEffect(() => {
    const el = heroPriceRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPriceVisible(entry.isIntersecting),
      { root: null, rootMargin: `-${STICKY_HEADER_HEIGHT}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Add/Update-to-portfolio CTA hides on scroll down and reappears on
  // scroll up, same as X's bottom nav — keeps it out of the way while
  // reading, back within reach the moment you start scrolling back.
  const [ctaVisible, setCtaVisible] = useState(true);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastY;
        if (Math.abs(delta) > 6) {
          setCtaVisible(delta < 0 || currentY < 120);
          lastY = currentY;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <p className="section-eyebrow mb-2">{children}</p>
  );

  return (
    <div className="page-canvas min-h-screen bg-background pb-28">
      {/* Slim sticky header. Before the hero price scrolls out of view, this
          shows a bigger ticker symbol + the full company name underneath —
          filling the space that would otherwise sit empty. Once the hero
          price is gone, the ticker shrinks back down, the company name is
          replaced by the market price, and the day's KES/% change fades in
          on the right (where the market-open badge used to sit). */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="tap-scale h-9 w-9 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold tracking-tight transition-all duration-200 ${priceVisible ? 'text-lg' : 'text-sm'}`}>{symbol}</span>
                  <span className="text-[10px] text-muted-foreground">{stock.exchange}</span>
                </div>
                <div className="relative h-[15px] min-w-0">
                  <p className={`absolute inset-0 text-[11px] text-muted-foreground truncate transition-opacity duration-200 ${priceVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {stock.name}
                  </p>
                  <span className={`absolute inset-0 text-sm font-bold tabular leading-tight transition-opacity duration-200 ${priceVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {stock.isLive ? stock.price.toFixed(2) : <Skeleton className="h-4 w-14 inline-block align-middle" />}
                  </span>
                </div>
              </div>
              <div className={`flex flex-col leading-tight shrink-0 transition-opacity duration-200 ${priceVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <span className={`text-xs font-semibold tabular ${dayChangeIsUp ? 'text-bull' : 'text-bear'}`}>
                  {stock.isLive ? <>{dayChangeIsUp ? '+' : ''}{stock.change.toFixed(2)}</> : <Skeleton className="h-3 w-10" />}
                </span>
                <span className={`text-[11px] font-medium tabular flex items-center gap-0.5 ${dayChangeIsUp ? 'text-bull' : 'text-bear'}`}>
                  {stock.isLive ? (
                    <>
                      {dayChangeIsUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {dayChangeIsUp ? '+' : ''}{stock.changePercent}%
                    </>
                  ) : (
                    <Skeleton className="h-3 w-10" />
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Toggle watchlist" onClick={handleWatchlistToggle} className="h-9 w-9 tap-scale">
              <Heart className={`h-4 w-4 ${isInWatchlist(symbol || '') ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Price alerts" className="h-9 w-9 tap-scale" onClick={() => setStockAlertOpen(true)}>
              <AlarmClock className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </header>

      {/* HERO — company · price · delta. No card. */}
      <div className="px-4 pt-4 pb-2 animate-fade-in">
        <h1 className="text-[15px] font-medium text-muted-foreground tracking-tight leading-tight">{stock.name}</h1>
        <div ref={heroPriceRef} className="mt-1 flex items-end justify-between gap-3">
          {stock.isLive ? (
            <span className="text-4xl font-bold tabular tracking-tight">KES {displayPrice.toFixed(2)}</span>
          ) : (
            <Skeleton className="h-9 w-40" />
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label="Compare stock"
            onClick={() => navigate(`/compare?stock=${symbol}`)}
            className="h-8 rounded-full px-3 text-[11px] font-semibold text-muted-foreground gap-1.5"
          >
            <GitCompare className="h-3.5 w-3.5" />
            Compare
          </Button>
        </div>
        <div className={`text-sm font-semibold flex items-center gap-1 mt-1 tabular ${displayIsUp ? 'text-bull' : 'text-bear'}`}>
          {stock.isLive ? (
            <>
              {displayIsUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{priceChange >= 0 ? '+' : ''}KES {Math.abs(priceChange).toFixed(2)} · {priceChange >= 0 ? '+' : ''}{priceChangePercent}%</span>
              <span className="text-muted-foreground font-normal text-xs ml-1">{hoverDate || timeframeLabels[selectedTimeframe] || selectedTimeframe}</span>
            </>
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
        </div>
      </div>

      {/* CHART — embedded, no card wrapper */}
      <div className="relative">
        <div className="px-1">
          <StockPriceChart symbol={symbol} timeframe={selectedTimeframe} chartType={chartType} onHoverPrice={handleChartHover} data={periodData} indicators={indicatorSettings} mainHeight={280} />
        </div>
        {/* Chart tool row */}
        <div className="absolute top-2 right-3 z-10 flex items-center gap-1">
          <Button
            variant="ghost" size="icon" aria-label="Chart indicators"
            className={`h-7 w-7 rounded-full ${anyIndicatorsOn(indicatorSettings) ? "text-primary" : "text-muted-foreground"}`}
            onClick={() => setIndicatorsSheetOpen(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Change chart type" className="h-7 w-7 rounded-full text-muted-foreground">
                {chartType === "candle" ? <CandlestickChart className="h-3.5 w-3.5" /> : chartType === "line" ? <LineChartIcon className="h-3.5 w-3.5" /> : <AreaChartIcon className="h-3.5 w-3.5" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 z-[110]">
              {([
                { id: "line", label: "Line", icon: LineChartIcon },
                { id: "area", label: "Area", icon: AreaChartIcon },
                { id: "candle", label: "Candlestick", icon: CandlestickChart },
              ] as const).map(o => (
                <DropdownMenuItem key={o.id} onClick={() => setChartType(o.id)} className="text-xs gap-2">
                  <o.icon className="h-3.5 w-3.5" />
                  {o.label}
                  {chartType === o.id && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" aria-label="Fullscreen chart" className="h-7 w-7 rounded-full text-muted-foreground" onClick={() => setFullscreen(true)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Timeframe pills */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        {timeframes.map(tf => (
          <button
            key={tf}
            data-small-target
            onClick={() => setSelectedTimeframe(tf)}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md tabular border transition-colors ${tf === selectedTimeframe ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* FULLSCREEN CHART — Moomoo-style landscape overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-fade-in">
          {!fsImmersive && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{symbol}</span>
                  <span className="text-[10px] text-muted-foreground">{stock.exchange}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular">KES {displayPrice.toFixed(2)}</span>
                  <span className={`text-xs font-semibold tabular ${displayIsUp ? 'text-bull' : 'text-bear'}`}>
                    {priceChange >= 0 ? '+' : ''}{priceChangePercent}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="icon" aria-label="Chart indicators"
                  className={`h-9 w-9 rounded-full ${anyIndicatorsOn(indicatorSettings) ? "text-primary" : "text-muted-foreground"}`}
                  onClick={() => setIndicatorsSheetOpen(true)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Change chart type" className="h-9 w-9 rounded-full text-muted-foreground">
                      {chartType === "candle" ? <CandlestickChart className="h-4 w-4" /> : chartType === "line" ? <LineChartIcon className="h-4 w-4" /> : <AreaChartIcon className="h-4 w-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 z-[110]">
                    {([
                      { id: "line", label: "Line", icon: LineChartIcon },
                      { id: "area", label: "Area", icon: AreaChartIcon },
                      { id: "candle", label: "Candlestick", icon: CandlestickChart },
                    ] as const).map(o => (
                      <DropdownMenuItem key={o.id} onClick={() => setChartType(o.id)} className="text-xs gap-2">
                        <o.icon className="h-3.5 w-3.5" />{o.label}
                        {chartType === o.id && <span className="ml-auto text-primary">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" aria-label="Exit fullscreen" className="h-9 w-9 rounded-full text-muted-foreground" onClick={() => setFullscreen(false)}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Chart pane — real price scale on the right, draggable to zoom
              (drag the numbers up/down). The pencil tool's trendline drawing
              is handled inside StockPriceChart itself, anchored to real
              price/time so it survives axis zoom and resizing. */}
          <div className="relative flex-1 min-h-0 px-1 py-2">
            <StockPriceChart
              symbol={symbol}
              timeframe={selectedTimeframe}
              chartType={chartType}
              onHoverPrice={handleChartHover}
              data={periodData}
              indicators={indicatorSettings}
              showPriceAxis
              showGrid={fsShowGrid}
              pinCrosshair={fsCrosshairPinned}
              activeDrawTool={fsActiveDrawTool}
              onDrawToolComplete={() => setFsActiveDrawTool(null)}
              hideDrawings={fsDrawingsHidden}
              clearDrawSignal={fsClearDrawSignal}
              onDrawingsChange={setFsHasDrawings}
            />
          </div>

          {/* Bottom toolbar — period picker on the left (opens the same
              timeframes as the pills above), tools on the right. No share
              button here by design. */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/60 shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
            <DropdownMenu open={fsPeriodMenuOpen} onOpenChange={setFsPeriodMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8 rounded-md px-2.5 text-[12px] font-semibold gap-1">
                  {selectedTimeframe}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-32 z-[110]">
                {timeframes.map(tf => (
                  <DropdownMenuItem key={tf} onClick={() => setSelectedTimeframe(tf)} className="text-xs justify-between">
                    {tf}
                    {tf === selectedTimeframe && <span className="text-foreground">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon" aria-label="Crosshair tool"
                className={`h-8 w-8 rounded-full ${fsCrosshairPinned ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => setFsCrosshairPinned(v => !v)}
              >
                <Crosshair className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon" aria-label="Drawing tools"
                className={`h-8 w-8 rounded-full ${fsActiveDrawTool ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => setDrawToolsSheetOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {fsHasDrawings && (
                <Button
                  variant="ghost" size="icon" aria-label="Clear drawings"
                  className="h-8 w-8 rounded-full text-muted-foreground"
                  onClick={fsClearDrawings}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost" size="icon" aria-label="Toggle gridlines"
                className={`h-8 w-8 rounded-full ${fsShowGrid ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => setFsShowGrid(v => !v)}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon" aria-label={fsImmersive ? "Show header" : "Hide header"}
                className="h-8 w-8 rounded-full text-muted-foreground"
                onClick={() => setFsImmersive(v => !v)}
              >
                {fsImmersive ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DrawingToolsSheet
        open={drawToolsSheetOpen}
        onOpenChange={setDrawToolsSheetOpen}
        onSelectTool={fsSelectDrawTool}
        hasDrawings={fsHasDrawings}
        onHideAll={fsToggleHideDrawings}
        onClearAll={fsClearDrawings}
      />

      {/* STICKY SUB-NAV */}
      <div className="sticky top-[53px] z-30 bg-background/92 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide">
          {SUB_NAV.map(s => (
            <button
              key={s.id}
              data-small-target
              onClick={() => scrollTo(s.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${section === s.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTIONS — canvas-first, hairline separated */}
      <div className="px-4 pt-5 pb-6 space-y-10">
        {/* OVERVIEW */}
        <section ref={refs.overview} data-section="overview" className="space-y-5 scroll-mt-32">
          {myHolding && (
            <div>
              <Eyebrow>Your Position</Eyebrow>
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <div className="grid grid-cols-3 gap-6 flex-1">
                  <div><p className="text-[10px] text-muted-foreground">Shares</p><p className="text-sm font-semibold tabular">{myHolding.shares}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Avg cost</p><p className="text-sm font-semibold tabular">KES {myHolding.avg_cost.toFixed(2)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">P/L</p>
                    <p className={`text-sm font-semibold tabular ${(stock.price - myHolding.avg_cost) >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {(stock.price - myHolding.avg_cost) >= 0 ? '+' : ''}{(((stock.price - myHolding.avg_cost) / myHolding.avg_cost) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <AddInvestmentDialog lockedSymbol={symbol} lockedName={stock.name} lockedSector={stock.sector}
                  trigger={<Button size="sm" variant="ghost" className="h-8 text-xs text-primary"><Pencil className="h-3 w-3 mr-1" /> Edit</Button>} />
              </div>
            </div>
          )}

          <div>
            <Eyebrow>Key Statistics</Eyebrow>
            <div className="border-t border-border/60">
              {([
                ["Market Cap", stock.marketCap],
                ["P/E Ratio", stock.pe],
                ["EPS", stock.isLive ? `KES ${stock.eps}` : null],
                ["Dividend Yield", stock.isLive ? `${divYield}%` : null],
                ["52W High", stock.isLive ? `KES ${stock.high52}` : null],
                ["52W Low", stock.isLive ? `KES ${stock.low52}` : null],
                ["Volume", stock.volume != null ? stock.volume.toLocaleString() : null],
                ["Beta", stock.beta || "—"],
              ] as [string, string | number | null][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2.5 border-b border-border/40">
                  <span className="text-xs text-muted-foreground">{k}</span>
                  {v != null ? (
                    <span className="text-xs font-semibold tabular">{v}</span>
                  ) : (
                    <Skeleton className="h-3.5 w-14" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <AIThesisCard
            symbol={symbol || ""} name={stock.name} sector={stock.sector}
            price={stock.price} changePercent={stock.changePercent}
            pe={stock.pe} eps={stock.eps} dividend={stock.dividend}
            marketCap={stock.marketCap ?? "—"} scores={scores as any}
          />

          <div>
            <Eyebrow>Investment Health Score</Eyebrow>
            <ContinuaScoreCard scores={scores} />
          </div>

          {stockNews.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="section-eyebrow">Recent News</p>
                <button data-small-target onClick={() => scrollTo("news")} className="text-[11px] text-primary font-semibold flex items-center">More <ChevronRight className="h-3 w-3" /></button>
              </div>
              <div className="border-t border-border/60">
                {stockNews.slice(0, 3).map(n => (
                  <a
                    key={n.id}
                    href={n.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-small-target
                    className="w-full flex items-start justify-between py-3 border-b border-border/40 gap-3 text-left active:opacity-70 transition-opacity"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug">{n.headline}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.sourceName} · {n.publishedAt ? formatTimestamp(n.publishedAt) : "Date unknown"}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RESEARCH */}
        <section ref={refs.research} data-section="research" className="space-y-4 scroll-mt-32">
          <Eyebrow>Research</Eyebrow>
          {/* Jump nav — scrolls to a section rather than switching a tab,
              since the report below is one continuous scroll now. Tracks
              which report section is in view and rings it, same idea as
              the Overview/Research/News row above but as an outline
              instead of a fill — this is the nested, sub-level nav. */}
          <div className="sticky top-[97px] z-20 -mx-4 px-4 py-2 bg-background/92 backdrop-blur-xl border-b border-border/60">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {REPORT_JUMP_NAV.map(({ id, label }) => (
                <button
                  key={id}
                  data-small-target
                  onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap border transition-colors ${
                    reportSection === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-10 pt-2">
            <div id="rpt-snowflake" className="scroll-mt-40"><StockSnowflake symbol={symbol || ""} /></div>
            <div id="rpt-1" className="scroll-mt-40"><ValuationSection symbol={symbol || ""} name={stock.name} sector={stock.sector} price={stock.price} currency={exchangeMeta.currency} /></div>
            <div id="rpt-2" className="scroll-mt-40"><FutureGrowthSection symbol={symbol || ""} /></div>
            <div id="rpt-3" className="scroll-mt-40"><PastPerformanceSection symbol={symbol || ""} currency={exchangeMeta.currency} /></div>
            <div id="rpt-4" className="scroll-mt-40"><FinancialHealthSection symbol={symbol || ""} currency={exchangeMeta.currency} /></div>
            <div id="rpt-5" className="scroll-mt-40"><RiskSection symbol={symbol || ""} /></div>
            <div id="rpt-6" className="scroll-mt-40"><DividendsSection symbol={symbol || ""} currency={exchangeMeta.currency} divYield={divYield} annualDividend={stock.dividend} /></div>
            <div id="rpt-7" className="scroll-mt-40"><ManagementSection symbol={symbol || ""} /></div>
            <div id="rpt-8" className="scroll-mt-40"><OwnershipSection ownership={liveOwnership} topShareholders={liveTopShareholders} isLoading={ownershipLoading} /></div>
            <div id="rpt-9" className="scroll-mt-40"><CompanyInfoSection symbol={symbol || ""} exchange={exchangeMeta.code} marketCap={stock.marketCap ?? "—"} /></div>
            <div id="rpt-technicals" className="scroll-mt-40 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Technicals and the Institutional Scorecard below aren't part of Simply Wall St's report —
                they're Continua-original tools kept from the existing research suite.
              </p>
              <TechnicalsTab symbol={symbol || ""} currency={exchangeMeta.currency} />
              <ScoresTab fundamentals={liveFundamentals} />
            </div>
          </div>
        </section>

        {/* NEWS */}
        <section ref={refs.news} data-section="news" className="space-y-4 scroll-mt-32">
          <Eyebrow>News about {symbol}</Eyebrow>
          <NewsEventsTab
            symbol={symbol || ""} name={stock.name} sector={stock.sector}
            price={stock.price} changePercent={stock.changePercent}
            pe={stock.pe} eps={stock.eps} dividend={stock.dividend}
          />
        </section>

        {/* COMMUNITY */}
        <section ref={refs.community} data-section="community" className="space-y-4 scroll-mt-32">
          <Eyebrow>Community</Eyebrow>
          <CommunityTab symbol={symbol || ""} />
        </section>

        {/* MORE */}
        <section ref={refs.more} data-section="more" className="space-y-3 scroll-mt-32">
          <Eyebrow>More</Eyebrow>
          <div className="border-t border-border/60">
            {[
              {
                icon: Building2, label: "Company Profile", detail: company.description,
                action: () => setInfoSheet({ title: "Company Profile", body: <p className="text-sm leading-relaxed">{company.description}</p> }),
              },
              {
                icon: Users2, label: "Management", detail: `CEO · ${company.ceo}`,
                action: () => setInfoSheet({
                  title: "Management",
                  body: (
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">CEO:</span> {company.ceo}</p>
                      <p><span className="text-muted-foreground">Employees:</span> {company.employees}</p>
                      <p className="text-[11px] text-muted-foreground pt-2">Full leadership team and board data isn't in the Data Layer's /companies/:symbol response yet — this shows the CEO field only, live.</p>
                    </div>
                  ),
                }),
              },
              {
                icon: Briefcase, label: "Corporate Actions",
                detail: actionsLoading ? "Loading…" : corporateActions.length > 0 ? `${corporateActions.length} on record` : "None on record yet",
                action: () => setInfoSheet({
                  title: "Corporate Actions",
                  body: corporateActions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No dividends, splits, or other corporate actions on record for {symbol} yet.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[50vh] overflow-y-auto">
                      {corporateActions.map(a => (
                        <div key={a.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
                          <div>
                            <p className="text-xs font-semibold capitalize">{a.type.replace(/_/g, " ")}</p>
                            <p className="text-[11px] text-muted-foreground">{a.exDate ? `Ex-date ${new Date(a.exDate).toLocaleDateString()}` : new Date(a.announcedAt).toLocaleDateString()}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ),
                }),
              },
              {
                icon: FileText, label: "Documents", detail: "Not connected yet",
                action: () => toast({ title: "No filings source yet", description: "Annual reports & filings need a documents/filings endpoint on the Data Layer — none is defined in docs/api/API.md yet." }),
              },
              { icon: Heart, label: "Watchlist", detail: isInWatchlist(symbol || "") ? "In your watchlist" : "Add to watchlist", action: handleWatchlistToggle },
              { icon: GitCompare, label: "Compare", detail: "Benchmark against peers", action: () => navigate(`/compare?stock=${symbol}`) },
              { icon: Download, label: "Export", detail: "Download data as CSV", action: () => toast({ title: "Export coming soon" }) },
              { icon: Bell, label: "Alerts", detail: "Price & event alerts", action: () => setShowAlertsDialog(true) },
              { icon: MessageSquare, label: "Discuss on TradersHub", detail: `Start a $${symbol} thread`, action: () => navigate(`/traders-hub?compose=true&ticker=${symbol}`) },
              {
                icon: Eye, label: "Founded / HQ", detail: `${company.founded} · ${company.headquarters}`,
                action: () => setInfoSheet({
                  title: "Founded / HQ",
                  body: (
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Founded:</span> {company.founded}</p>
                      <p><span className="text-muted-foreground">Headquarters:</span> {company.headquarters}</p>
                    </div>
                  ),
                }),
              },
            ].map(row => (
              <button
                key={row.label}
                data-small-target
                onClick={row.action}
                className="w-full flex items-center justify-between py-3 border-b border-border/40 text-left hover:bg-muted/30 -mx-4 px-4 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <row.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{row.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{row.detail}</p>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <Dialog open={!!infoSheet} onOpenChange={(open) => !open && setInfoSheet(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{infoSheet?.title}</DialogTitle>
          </DialogHeader>
          {infoSheet?.body}
        </DialogContent>
      </Dialog>

      {/* Fixed Add Investment CTA — compact, pinned to the very bottom edge.
          Slides out of view on scroll-down and back in on scroll-up. */}
      <div
        className={`fixed left-6 right-6 z-30 transition-transform duration-300 ease-out ${ctaVisible ? "translate-y-0" : "translate-y-[calc(100%+24px)]"}`}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1px)" }}
      >
        <AddInvestmentDialog
          lockedSymbol={symbol} lockedName={stock.name} lockedSector={stock.sector}
          trigger={
            <Button className="w-full h-10 rounded-full brand-active font-semibold text-xs shadow-lg hover:shadow-xl">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {myHolding ? `Update ${symbol} holding` : `Add ${symbol} to portfolio`}
            </Button>
          }
        />
      </div>


      <ChartIndicatorsSheet open={indicatorsSheetOpen} onOpenChange={setIndicatorsSheetOpen} settings={indicatorSettings} onChange={setIndicatorSettings} />

      {showAlertsDialog && <PriceAlertsManager />}
      <StockAlertDialog open={stockAlertOpen} onOpenChange={setStockAlertOpen} symbol={symbol || ""} currentPrice={stock.price} />
      <AddToWatchlistDialog open={watchlistDialogOpen} onOpenChange={setWatchlistDialogOpen} symbol={symbol || ""} name={stock.name} />
    </div>
  );
}