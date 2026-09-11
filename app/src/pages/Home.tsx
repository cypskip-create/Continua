import { useState } from "react";
import { Crown, MessageCircle, ChevronRight, Wallet, Eye, EyeOff, ArrowUpRight, ArrowDownRight, LogIn, TrendingUp, Search, Sparkles, Coins, Shield, BarChart3, Bell, Binoculars } from "lucide-react";
import { QuickTradeWidget } from "@/components/home/QuickTradeWidget";
import { CommandCenterSections } from "@/components/home/CommandCenterSections";
import { TopBar } from "@/components/shared/TopBar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";
import { usePosts } from "@/hooks/usePosts";
import { getTimeBasedGreeting } from "@/utils/timeGreeting";
import { MarketStatusIndicator } from "@/components/shared/MarketStatusIndicator";
import { computePortfolioStats } from "@/lib/stockPrices";
import { useLivePortfolioQuotes, useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useIndices } from "@/hooks/useIndices";
import { formatPostDate } from "@/lib/formatTimestamp";


const Eyebrow = ({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) => (
  <div className="flex items-center justify-between mb-2">
    <p className="section-eyebrow">{children}</p>
    {action && (
      <button data-small-target onClick={onAction} className="text-[11px] text-primary font-semibold flex items-center">
        {action} <ChevronRight className="h-3 w-3" />
      </button>
    )}
  </div>
);

export default function Home() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { portfolio } = usePortfolio();
  const { watchlist } = useWatchlist();
  const { posts } = usePosts();
  const navigate = useNavigate();
  const { greeting } = getTimeBasedGreeting();
  const [showBalance, setShowBalance] = useState(true);

  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Investor';
  const hasPortfolio = user && portfolio.length > 0;
  const { liveQuotes: livePortfolioQuotes } = useLivePortfolioQuotes(portfolio.map(h => h.symbol));
  const { totalValue: portfolioValue, totalGain: portfolioGain, gainPct: portfolioGainPct } = computePortfolioStats(portfolio, livePortfolioQuotes);

  // Real watchlist, ranked by today's biggest movers. Overlaid with live
  // Continua Data Layer quotes; a symbol with no live quote yet is
  // excluded from the movers list rather than shown with a fabricated
  // price/change.
  const { quotes: watchlistQuotes } = useLiveQuotes(watchlist.map(w => w.symbol));
  const watchlistMovers = watchlist
    .map(w => {
      const q = watchlistQuotes[w.symbol.toUpperCase()];
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

  const economicEvents = [
    { title: "CBK Rate Decision", when: "Tomorrow · 2:00 PM" },
    { title: "Kenya CPI Inflation", when: "Thu · 9:00 AM" },
    { title: "US FOMC Minutes", when: "Fri · 9:00 PM" },
  ];

  return (
    <div className="page-canvas min-h-screen bg-background pb-24">
      <TopBar
        title="Continua"
        subtitle={user ? `${greeting}, ${firstName}` : "Your smart companion"}
        showSearch
        showNotifications
        showExchangeSelector
      />

      <div className="px-4 pt-3 space-y-6">
        {/* Auth CTA — non-users */}
        {!user && (
          <div className="border border-primary/25 bg-primary/5 rounded-2xl p-5 text-center">
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
          <div className="flex items-center justify-between pb-1">
            <p className="text-[11px] text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <MarketStatusIndicator />
          </div>
        )}

        {/* PORTFOLIO SUMMARY — no card, big number */}
        {hasPortfolio && (
          <div className="cursor-pointer" onClick={() => navigate('/track-investments')}>
            <Eyebrow action="Details" onAction={() => navigate('/track-investments')}>Portfolio</Eyebrow>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tabular tracking-tight">
                  {showBalance ? `KES ${portfolioValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '••••••'}
                </p>
                <div className={`text-xs font-semibold flex items-center gap-1 mt-0.5 tabular ${portfolioGain >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {portfolioGain >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {showBalance && (
                    <>
                      {portfolioGain >= 0 ? '+' : ''}KES {Math.abs(portfolioGain).toLocaleString('en-US', { maximumFractionDigits: 0 })} ·{' '}
                    </>
                  )}
                  <span>{portfolioGainPct >= 0 ? '+' : ''}{portfolioGainPct.toFixed(2)}%</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); setShowBalance(!showBalance); }}>
                {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* MARKET SNAPSHOT — inline stat row */}
        <div>
          <Eyebrow action="Markets" onAction={() => navigate('/markets')}>Market Snapshot</Eyebrow>
          <div className="grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
            {nseIndices.map(idx => (
              <div key={idx.name} className="cursor-pointer" onClick={() => navigate('/markets')}>
                <p className="text-[10px] text-muted-foreground">{idx.name}</p>
                <p className="text-sm font-semibold tabular mt-0.5">{idx.value}</p>
                <p className={`text-[10px] font-semibold flex items-center gap-0.5 tabular ${idx.isUp ? 'text-bull' : 'text-bear'}`}>
                  {idx.isUp ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {idx.isUp ? '+' : ''}{idx.change}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* QUICK WATCH — marquee, no card */}
        {user && (
          <div>
            <Eyebrow>Quick Watch</Eyebrow>
            <QuickTradeWidget />
          </div>
        )}

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
            {watchlistMovers.length === 0 ? (
              <div className="border-t border-border/60 py-6 text-center">
                <Binoculars className="h-7 w-7 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs font-semibold">Your watchlist is empty</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">Add stocks to track their moves here.</p>
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
                      <p className="text-[10px] text-muted-foreground">{s.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold tabular">KES {s.price.toFixed(2)}</p>
                      <p className={`text-[10px] font-semibold tabular ${s.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ECONOMIC EVENTS */}
        <div>
          <Eyebrow>Economic Events</Eyebrow>
          <div className="border-t border-border/60">
            {economicEvents.map(e => (
              <div key={e.title} className="flex items-center justify-between py-2.5 border-b border-border/40">
                <p className="text-xs font-medium">{e.title}</p>
                <p className="text-[10px] text-muted-foreground tabular">{e.when}</p>
              </div>
            ))}
          </div>
        </div>

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
                    <AvatarFallback className="bg-muted text-foreground text-[10px]">
                      {post.author?.full_name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold truncate">{post.author?.full_name || "User"}</span>
                      {(post.author as any)?.handle && (
                        <span className="text-[10px] text-muted-foreground truncate">@{(post.author as any).handle}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground shrink-0">
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
        <CommandCenterSections />

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
                <p className="text-[10px] text-muted-foreground truncate">Advanced insights & real-time prices</p>
              </div>
            </div>
            <span className="text-xs font-bold text-primary shrink-0 whitespace-nowrap">KES 800/mo →</span>
          </button>
        )}

      </div>
    </div>
  );
}