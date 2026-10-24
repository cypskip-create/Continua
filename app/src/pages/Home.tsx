import { RollingNumber } from "@/components/shared/RollingNumber";
import { HomeEngineIntro } from "@/components/home/HomeEngineIntro";
import { HomePortfolioOverview } from "@/components/home/HomePortfolioOverview";
import { HomeQuickWatch } from "@/components/home/HomeQuickWatch";
import { useMemo, useState } from "react";
import { Crown, ChevronRight, LogIn, TrendingUp, Search, Coins, Shield, Bell, Binoculars, GitCompare, Grid3X3 } from "lucide-react";
import { CommandCenterSections } from "@/components/home/CommandCenterSections";
import { TopBar } from "@/components/shared/TopBar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";
import { usePosts } from "@/hooks/usePosts";
import { getTimeBasedGreeting } from "@/utils/timeGreeting";
import { MarketStatusIndicator } from "@/components/shared/MarketStatusIndicator";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { STOCK_POOL } from "@/lib/homeSymbolPools";
import { useIndices } from "@/hooks/useIndices";
import { formatPostDate } from "@/lib/formatTimestamp";
import { UpdatesFeed } from "@/components/home/UpdatesFeed";
import { PortfolioPulse } from "@/components/home/PortfolioPulse";
import { MarketIndexStrip } from '@/components/home/MarketIndexStrip';


const Eyebrow = ({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) => (
  <div className="flex items-center justify-between mb-2">
    <h2 className="text-lg font-medium">{children}</h2>
    {action && (
      <button data-small-target onClick={onAction} className="text-[0.6875rem] text-primary font-semibold flex items-center">
        {action} <ChevronRight className="h-3 w-3" />
      </button>
    )}
  </div>
);

function getAuthorHandle(author: unknown): string | undefined {
  if (!author || typeof author !== "object" || !("handle" in author)) return undefined;
  const handle = (author as { handle?: unknown }).handle;
  return typeof handle === "string" ? handle : undefined;
}

export default function Home() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { portfolio } = usePortfolio();
  const { watchlist, loading: watchlistLoading, isError: watchlistError } = useWatchlist();
  const { posts } = usePosts();
  const navigate = useNavigate();
  const { greeting } = getTimeBasedGreeting();
  const [showBalance, setShowBalance] = useState(true);

  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Investor';

  // ONE shared quote fetch for the whole Home page — portfolio holdings,
  // watchlist, and CommandCenterSections'/QuickTradeWidget's pools, all in
  // a single request instead of each section firing its own. Previously
  // 4 separate useLiveQuotes calls hit the backend in parallel on every
  // Home mount; QUICK_SYMBOLS is a subset of STOCK_POOL, so this one
  // union covers everything below.
  const unionSymbols = useMemo(
    () => [...new Set([...portfolio.map(h => h.symbol), ...watchlist.map(w => w.symbol), ...STOCK_POOL])],
    [portfolio, watchlist]
  );
  const { quotes: homeQuotes, isLoading: quotesLoading, isError: quotesError } = useLiveQuotes(unionSymbols);

  // Real watchlist, ranked by today's biggest movers. Overlaid with live
  // Continua Data Layer quotes; a symbol with no live quote yet is
  // excluded from the movers list rather than shown with a fabricated
  // price/change.
  const watchlistMovers = watchlist
    .map(w => {
      const q = homeQuotes[w.symbol.toUpperCase()];
      if (!q) return null;
      return { symbol: w.symbol, name: w.name, price: q.lastPrice, changePct: q.changePercent };
    })
    .filter((w): w is { symbol: string; name: string; price: number; changePct: number } => w !== null)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);

  // Live from the Continua Data Layer (same source Markets uses) — no
  // hardcoded fallback here, since a stale/static index value on the home
  // page would silently disagree with the real Markets tab.
  const { indices: liveIndices } = useIndices();
  const nseIndices = liveIndices.map(idx => ({
    name: idx.code,
    timestamp: idx.timestamp,
    value: idx.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    change: idx.changePercent,
    isUp: idx.change >= 0,
  }));

  const opportunities = [
    { label: "Undervalued",     icon: Coins,      route: "/screener?filter=undervalued" },
    { label: "High Growth",     icon: TrendingUp, route: "/screener?filter=growth" },
    { label: "Strong Dividends",icon: Coins,      route: "/screener?filter=dividends" },
    { label: "Financial Health",icon: Shield,     route: "/screener?filter=health" },
  ];

  const researchTools = [
    { label: "Stock Screener", detail: "Filter valuation, growth and yield", icon: Search, route: "/screener" },
    { label: "Compare", detail: "Review companies side by side", icon: GitCompare, route: "/compare" },
    { label: "Sector Heatmap", detail: "Scan sector strength at a glance", icon: Grid3X3, route: "/sector-heatmap" },
    { label: "Price Alerts", detail: "Monitor prices and technical signals", icon: Bell, route: "/alerts" },
  ];

  // Followed symbols feed the Updates section below — whatever the
  // person holds or watches; UpdatesFeed falls back to the general
  // market feed for a signed-out visitor or an empty portfolio/watchlist.
  const followedSymbols = [...new Set([...portfolio.map(h => h.symbol), ...watchlist.map(w => w.symbol)])];

  return (
    <div className="home-desk page-canvas min-h-screen bg-background pb-24">
      <TopBar
        title="Continua"
        subtitle={user ? `${greeting}, ${firstName}` : "Your smart companion"}
        showSearch={false}
        showNotifications
      />

      <div className="desk-content home-flow px-4 pt-3 space-y-4">
        {/* Auth CTA — non-users */}
        {!user && (
          <div className="flat-section border border-primary/25 bg-primary/5 rounded-2xl p-5 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <LogIn className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold mb-1 text-sm">Start Your Journey</h3>
            <p className="text-xs text-muted-foreground mb-4">Track your portfolio & join the community.</p>
            <Button className="btn-primary w-full h-11" onClick={() => navigate('/auth')}>Sign Up / Login</Button>
          </div>
        )}

        {/* Greeting line + status */}
        {user && (
          <div className="home-session-row flex items-center justify-between pb-1">
            <p className="text-[0.6875rem] text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Africa/Nairobi' })}
            </p>
            <MarketStatusIndicator />
          </div>
        )}

        {user && <HomePortfolioOverview portfolio={portfolio} quotes={homeQuotes} visible={showBalance} onToggle={() => setShowBalance(value => !value)} />}

        {/* MARKET SNAPSHOT — inline stat row */}
        <div>
          <Eyebrow action="Markets" onAction={() => navigate('/markets')}>Market Snapshot</Eyebrow>
          {!nseIndices.length && <p className="py-2 text-xs text-muted-foreground">Published NSE index observations are not available yet.</p>}
          <MarketIndexStrip indices={nseIndices} onSelect={()=>navigate('/markets')}/>
        </div>

        {/* QUICK WATCH — directly below Market Snapshot, as the fast path
            from the index overview into individual live quotes. */}
        {user && (
          <div>
            <Eyebrow action="Edit" onAction={() => navigate('/watchlist')}>Quick Watch</Eyebrow>
            <HomeQuickWatch watchlist={watchlist} quotes={homeQuotes} />
          </div>
        )}

        {/* UPDATES — real scraped news, real upcoming dividends, and real
            reported earnings merged into one chronological feed. */}
        <HomeEngineIntro plan={profile?.subscription_plan} />

        {/* A compact research launchpad makes the analysis workflow visible
            from Home instead of hiding capable tools several screens deep. */}
        <div>
          <Eyebrow action="All markets" onAction={() => navigate('/markets')}>Research Toolkit</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {researchTools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                data-small-target
                onClick={() => navigate(tool.route)}
                className="editorial-section min-h-[88px] px-1 text-left hover:text-primary transition-colors"
              >
                <tool.icon className="h-4 w-4 text-primary mb-3" />
                <p className="text-xs font-bold">{tool.label}</p>
                <p className="text-[0.625rem] leading-snug text-muted-foreground mt-0.5">{tool.detail}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="home-developments"><div><UpdatesFeed compact followedSymbols={followedSymbols} limit={3} /></div>{user && <aside><PortfolioPulse compact title="Insights for you" showValues={showBalance} /></aside>}</div>

        {/* OPPORTUNITIES — pill row */}
        <div>
          <Eyebrow>Opportunities</Eyebrow>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            {opportunities.map(o => (
              <button
                key={o.label}
                data-small-target
                onClick={() => navigate(o.route)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-border/70 hover:border-primary/40 hover:bg-primary/5 text-xs font-medium transition-colors"
              >
                <o.icon className="h-3.5 w-3.5 text-primary" />
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* WATCHLIST MOVERS — real watchlist, ranked by today's biggest move */}
        {user && (
          <div>
            <Eyebrow action="Watchlist" onAction={() => navigate('/watchlist')}>Watchlist Movers</Eyebrow>
            {watchlistError && !watchlist.length ? <p className="py-6 text-sm text-muted-foreground">Watchlist could not be loaded. Please try again.</p> : watchlistLoading || (watchlist.length > 0 && quotesLoading) ? <p role="status" className="py-6 text-sm text-muted-foreground">Loading watchlist prices…</p> : watchlist.length > 0 && watchlistMovers.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{quotesError ? "Prices could not be loaded. Please try again." : "Prices are currently unavailable for your watched stocks."}</p> : watchlistMovers.length === 0 ? (
              <div className="border-t border-border/60 py-6 text-center">
                <Binoculars className="h-7 w-7 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs font-semibold">Your watchlist is empty</p>
                <p className="text-[0.6875rem] text-muted-foreground mt-0.5 mb-3">Add stocks to track their moves here.</p>
                <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={() => navigate('/markets')}>
                  Browse stocks
                </Button>
              </div>
            ) : (
              <div className="border-t border-border/60">
                {watchlistMovers.map(s => (
                  <button
                    key={s.symbol}
                    data-small-target
                    onClick={() => navigate(`/stock/${s.symbol}`)}
                    className="w-full flex items-center justify-between py-2.5 border-b border-border/40 hover:bg-muted/30 -mx-4 px-4 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-xs font-semibold">{s.symbol}</p>
                      <p className="text-[0.625rem] text-muted-foreground">{s.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold tabular">KES <RollingNumber value={s.price.toFixed(2)} /></p>
                      <p className={`text-[0.625rem] font-semibold tabular ${s.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {s.changePct >= 0 ? '+' : ''}<RollingNumber value={s.changePct.toFixed(2)} />%
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRENDING TRADERSHUB */}
        {posts.length > 0 && (
          <div>
            <Eyebrow action="All" onAction={() => navigate('/traders-hub')}>Trending on TradersHub</Eyebrow>
            <div className="border-t border-border/60">
              {posts.slice(0, 3).map(post => (
                <button
                  key={post.id}
                  data-small-target
                  onClick={() => navigate(`/traders-hub?post=${post.id}`)}
                  className="w-full flex items-start gap-2.5 py-3 border-b border-border/40 text-left hover:bg-muted/30 -mx-4 px-4 transition-colors"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={post.author?.avatar_url || ""} />
                    <AvatarFallback className="bg-muted text-foreground text-[0.625rem]">
                      {post.author?.full_name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold truncate">{post.author?.full_name || "User"}</span>
                      {getAuthorHandle(post.author) && (
                        <span className="text-[0.625rem] text-muted-foreground truncate">@{getAuthorHandle(post.author)}</span>
                      )}
                      <span className="text-[0.625rem] text-muted-foreground shrink-0">
                        · {formatPostDate(post.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{post.content}</p>
                  </div>

                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI INSIGHT + opportunities + calendar (already flat) */}
        <CommandCenterSections quotes={homeQuotes} />

        {/* Upgrade banner (free) */}
        {user && profile?.subscription_plan !== 'premium' && (
          <button
            data-small-target
            className="grouped-card w-full flex items-center justify-between gap-3 p-4 rounded-2xl border border-primary/25 bg-primary/5 text-left"
            onClick={() => navigate('/upgrade')}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Crown className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">Unlock Premium</p>
                <p className="text-[0.625rem] text-muted-foreground truncate">Advanced insights & real-time prices</p>
              </div>
            </div>
            <span className="text-xs font-bold text-primary shrink-0 whitespace-nowrap">KES 800/mo →</span>
          </button>
        )}

      </div>
    </div>
  );
}
