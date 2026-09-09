import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Search, X, Bell, Feather, Users, Flame, MessageSquare, Hash, Building2, TrendingUp, ChevronDown, Newspaper, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePosts, Post } from "@/hooks/usePosts";
import { useFollows } from "@/hooks/useFollows";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";
import { HubPostCard } from "@/components/social/HubPostCard";
import { XComposeModal } from "@/components/social/XComposeModal";
import { TradersHubOnboarding, INTEREST_SECTOR_TICKERS } from "@/components/social/TradersHubOnboarding";
import { SuggestedForYou } from "@/components/social/SuggestedForYou";
import { PostSkeletonList } from "@/components/social/PostSkeleton";
import { MediaFeed } from "@/components/social/MediaFeed";
import { supabase } from "@/integrations/supabase/client";
import { atHandle, getInitials } from "@/lib/handle";
import { CommunityReaction } from "@/components/social/CommunityReactionButton";
import { useLivePortfolioQuotes } from "@/hooks/useLiveQuotes";
import { shareLink } from "@/lib/share";

type FeedTab = "for-you" | "following" | "trending";
type Tab = FeedTab | "media";

function isFeedTab(t: Tab): t is FeedTab {
  return t === "for-you" || t === "following" || t === "trending";
}

interface PeopleResult {
  user_id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
}

const NSE_NAMES: Record<string, string> = {
  SCOM: "Safaricom PLC", EQTY: "Equity Group Holdings",
  KCB: "KCB Group PLC", COOP: "Co-operative Bank", SCBK: "Standard Chartered Kenya",
  PORT: "East African Portland Cement", EABL: "East African Breweries", BAT: "BAT Kenya",
  ABSA: "ABSA Bank Kenya", NCBA: "NCBA Group", JUB: "Jubilee Holdings",
  BRIT: "Britam Holdings", DTK: "Diamond Trust Bank", KEGN: "KenGen PLC", KPLC: "Kenya Power",
};

export default function TradersHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { posts, loading, createPost, bookmarkPost, reactToPost, deletePost, editPost, reportPost, hidePost } = usePosts();
  const { isFollowing, toggleFollow, followingIds } = useFollows();
  const { portfolio } = usePortfolio();
  const { watchlist } = useWatchlist();
  const { notifications } = useNotifications();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return t === "media" || t === "following" || t === "trending" ? (t as Tab) : "for-you";
  });
  // Remembers which feed tab (For You / Following / Trending) to return to
  // when the person switches away from Media and back.
  const [lastFeedTab, setLastFeedTab] = useState<FeedTab>(() => {
    const t = searchParams.get("tab");
    return t === "following" || t === "trending" ? t : "for-you";
  });
  const [deepLinkArticleId, setDeepLinkArticleId] = useState<string | null>(() => searchParams.get("article"));
  // Captured once on mount (not read live off useLocation later) — the page that
  // linked here (e.g. Portfolio, a stock's news section) so the article's close
  // button can return there explicitly instead of relying on browser history,
  // which the URL cleanup below (a `replace`) can otherwise leave in a state
  // that doesn't round-trip cleanly back to where the user actually came from.
  const location = useLocation();
  const [returnTo] = useState<string | null>(() => (location.state as { returnTo?: string } | null)?.returnTo ?? null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [people, setPeople] = useState<PeopleResult[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [prefillContent, setPrefillContent] = useState("");
  const [sharePreset, setSharePreset] = useState<{ hideAmounts: boolean; hideGains: boolean; topHoldingsOnly: boolean; showDayChange: boolean } | undefined>();
  const [editing, setEditing] = useState<Post | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [disclaimerDone, setDisclaimerDone] = useState(() => {
    if (!user) return true;
    return !!localStorage.getItem(`tradershub_disclaimer_${user.id}`);
  });

  const hubUnread = useMemo(
    () => notifications.filter(n => !n.read && (n.feature === "tradershub" || n.feature === "social")).length,
    [notifications]
  );

  useEffect(() => {
    const urlSearch = searchParams.get("search");
    if (urlSearch) setSearchQuery(urlSearch);
    const ticker = searchParams.get("ticker");
    if (searchParams.get("compose") === "true" && ticker) {
      setComposeOpen(true);
      setPrefillContent(`$${ticker.toUpperCase()} `);
    } else if (searchParams.get("compose") === "true" && searchParams.get("attachPortfolio") === "true") {
      setComposeOpen(true);
      setSharePreset({
        hideAmounts: searchParams.get("hideAmounts") === "true",
        hideGains: searchParams.get("hideGains") === "true",
        topHoldingsOnly: searchParams.get("topOnly") === "true",
        showDayChange: searchParams.get("dayChange") !== "false",
      });
    } else if (ticker) {
      setSearchQuery(`$${ticker.toUpperCase()}`);
    }
    const postId = searchParams.get("post");
    if (postId) navigate(`/traders-hub/post/${postId}`, { replace: true });
  }, [searchParams, navigate]);

  // People search — users by name or handle
  useEffect(() => {
    const q = searchQuery.trim().replace(/^@/, "");
    if (q.length < 2) { setPeople([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles_public")
        .select("user_id, full_name, handle, avatar_url, bio")
        .or(`full_name.ilike.%${q}%,handle.ilike.%${q}%`)
        .limit(8);
      if (!cancelled) setPeople((data as PeopleResult[]) || []);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery]);

  const portfolioSymbols = useMemo(() => new Set(portfolio.map(h => h.symbol.toUpperCase())), [portfolio]);
  const watchlistSymbols = useMemo(() => new Set(watchlist.map(w => w.symbol.toUpperCase())), [watchlist]);
  const bookmarkedIds = useMemo(() => new Set(posts.filter(p => p.is_bookmarked).map(p => p.id)), [posts]);
  const reactedTopics = useMemo(() => {
    const set = new Set<string>();
    posts.filter(p => p.my_reaction).forEach(p => (p.stock_mentions || []).forEach(s => set.add(s.toUpperCase())));
    return set;
  }, [posts]);

  const trendingTickers = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach(p => (p.stock_mentions || []).forEach(s => {
      const sym = s.toUpperCase();
      counts.set(sym, (counts.get(sym) || 0) + 1);
    }));
    return [...counts.entries()].map(([symbol, count]) => ({ symbol, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [posts]);

  const { liveQuotes: livePortfolioQuotes } = useLivePortfolioQuotes(portfolio.map(h => h.symbol));

  const portfolioSnapshot = useMemo(() => {
    if (!portfolio.length) return null;
    // Only holdings with a real live quote are included — an unpriced
    // holding is left out of the snapshot (and its totals) rather than
    // priced from a fabricated fallback, since this snapshot is what
    // people actually attach to a public post.
    const holdings = portfolio
      .map(h => {
        const quote = livePortfolioQuotes[h.symbol.toUpperCase()];
        if (!quote) return null;
        const currentPrice = quote.price;
        const dayChangeAbs = quote.dayChangeAbs;
        return {
          symbol: h.symbol,
          name: h.name,
          shares: h.shares,
          avgCost: h.avg_cost,
          currentPrice,
          gain: ((currentPrice - h.avg_cost) / h.avg_cost) * 100,
          dayChangeAbs,
          dayChangePct: currentPrice - dayChangeAbs > 0 ? (dayChangeAbs / (currentPrice - dayChangeAbs)) * 100 : 0,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
    if (holdings.length === 0) return null;
    // Same maths as computePortfolioStats (lib/stockPrices.ts) — kept inline
    // here since we also need the per-holding breakdown above for the
    // compose card's "top holdings" list, which that helper doesn't return.
    const totalValue = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
    const totalCost = holdings.reduce((s, h) => s + h.avgCost * h.shares, 0);
    const todayGain = holdings.reduce((s, h) => s + h.dayChangeAbs * h.shares, 0);
    const prevValue = totalValue - todayGain;
    return {
      totalValue,
      totalGain: totalValue - totalCost,
      gainPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      todayGain,
      todayPercent: prevValue > 0 ? (todayGain / prevValue) * 100 : 0,
      holdings,
    };
  }, [portfolio, livePortfolioQuotes]);

  /** Feed ranking: portfolio, watchlist, reactions, saves, follows, engagement, recency. */
  const feed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^[#$@]/, "");
    let result = posts.filter(post => {
      if (q) {
        const inContent = post.content.toLowerCase().includes(q);
        const inTicker = post.stock_mentions?.some(s => s.toLowerCase().includes(q));
        const inAuthor = (post.author?.full_name || "").toLowerCase().includes(q) || (post.author?.handle || "").toLowerCase().includes(q);
        const inCompany = post.stock_mentions?.some(s => (NSE_NAMES[s.toUpperCase()] || "").toLowerCase().includes(q));
        if (!inContent && !inTicker && !inAuthor && !inCompany) return false;
      }
      if (activeTab === "following") return isFollowing(post.user_id);
      return true;
    });

    if (activeTab === "trending") {
      return [...result].sort((a, b) => {
        const score = (p: Post) => {
          const reacts = Object.values(p.reaction_counts || {}).reduce((s, n) => s + (n || 0), 0);
          const ageH = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
          return (reacts * 6 + p.comments_count * 9 + p.reposts_count * 5) / Math.pow(ageH + 2, 0.4);
        };
        return score(b) - score(a);
      });
    }

    if (activeTab === "for-you" && !q) {
      const myInterestSectors = new Set(profile?.interests || []);
      const myInterestTickers = new Set(
        [...myInterestSectors].flatMap(sector => INTEREST_SECTOR_TICKERS[sector] || [])
      );
      return [...result].map(post => {
        let score = 0;
        const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
        score += Math.max(0, 90 - ageHours * 1.8);
        if (isFollowing(post.user_id)) score += 45;
        if (user && post.user_id === user.id) score += 8;
        (post.stock_mentions || []).forEach(s => {
          const sym = s.toUpperCase();
          if (portfolioSymbols.has(sym)) score += 34;
          if (watchlistSymbols.has(sym)) score += 22;
          if (reactedTopics.has(sym)) score += 14;
          // Sector interests chosen during TradersHub onboarding — a post
          // mentioning a ticker from a sector someone said they follow
          // (e.g. "Banking") gets a boost even before they've ever
          // watchlisted or reacted to that specific ticker.
          if (myInterestTickers.has(sym)) score += 18;
        });
        if (bookmarkedIds.has(post.id)) score += 12;
        const reacts = Object.values(post.reaction_counts || {}).reduce((s, n) => s + (n || 0), 0);
        score += Math.min(reacts * 5, 45) + Math.min(post.comments_count * 7, 40);
        return { post, score };
      }).sort((a, b) => b.score - a.score).map(r => r.post);
    }

    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [posts, searchQuery, activeTab, isFollowing, portfolioSymbols, watchlistSymbols, reactedTopics, bookmarkedIds, user, profile?.interests]);

  // Merges into the current URL params instead of replacing them wholesale,
  // so switching tabs, searching, and the notification deep-link param
  // (?article=) never stomp on each other.
  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const setSearch = (q: string) => { setSearchQuery(q); updateParams({ search: q || null }); };
  const clearSearch = () => { setSearchQuery(""); updateParams({ search: null }); };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (isFeedTab(tab)) setLastFeedTab(tab);
    updateParams({ tab: tab === "for-you" ? null : tab, article: null });
  };

  const handleReact = useCallback(async (postId: string, reaction: CommunityReaction) => {
    if (!user) { navigate("/auth"); return; }
    await reactToPost(postId, reaction);
  }, [user, navigate, reactToPost]);

  const handleFollow = async (targetId: string) => {
    if (!user) { navigate("/auth"); return; }
    await toggleFollow(targetId);
  };

  const handleBookmark = async (postId: string) => {
    if (!user) { navigate("/auth"); return; }
    const saved = posts.find(p => p.id === postId)?.is_bookmarked;
    const { error } = await bookmarkPost(postId, !!saved);
    if (!error) toast({ title: saved ? "Removed from bookmarks" : "Saved to bookmarks" });
  };

  const handleShare = async (post: Post) => {
    const url = `${window.location.origin}/traders-hub/post/${post.id}`;
    const result = await shareLink(url, { title: "Continua TradersHub", text: post.content.slice(0, 120) });
    if (result.method === "clipboard") toast({ title: "Link copied" });
    else if (result.method === "failed") toast({ title: "Couldn't share this post", variant: "destructive" });
  };

  const feedTabs: { id: FeedTab; label: string }[] = [
    { id: "for-you", label: "For You" },
    { id: "following", label: "Following" },
    { id: "trending", label: "Trending" },
  ];
  const currentFeedLabel = feedTabs.find(t => t.id === (isFeedTab(activeTab) ? activeTab : lastFeedTab))?.label;

  const searching = searchQuery.trim().length > 0;
  const q = searchQuery.trim().replace(/^[#$@]/, "").toUpperCase();
  const tickerMatches = searching
    ? Object.keys(NSE_NAMES).filter(sym => sym.includes(q) || NSE_NAMES[sym].toUpperCase().includes(q)).slice(0, 5)
    : [];
  const hashtagMatches = searching
    ? [...new Set(posts.flatMap(p => p.content.match(/#\w+/g) || []))].filter(h => h.toUpperCase().includes(q)).slice(0, 5)
    : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      {!disclaimerDone && (
        <TradersHubOnboarding
          userId={user?.id}
          profile={profile}
          updateProfile={updateProfile}
          onDone={() => setDisclaimerDone(true)}
        />
      )}

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <Avatar
            className="h-10 w-10 shrink-0"
            onClick={() => user ? navigate(`/profile/${user.id}`) : navigate("/auth")}
          >
            <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="text-[12px] font-bold bg-primary/10 text-primary">{getInitials(profile?.full_name)}</AvatarFallback>
          </Avatar>

          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people, tickers, #topics, posts"
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
              className="h-10 pl-10 pr-9 rounded-full bg-muted/50 border-0 text-[13.5px]"
            />
            {searching && (
              <button onClick={clearSearch} data-small-target aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            data-small-target
            aria-label="TradersHub notifications"
            onClick={() => navigate("/notifications?feature=tradershub")}
            className="relative h-10 w-10 shrink-0 flex items-center justify-center text-muted-foreground"
          >
            <Bell className="h-5 w-5" />
            {hubUnread > 0 && (
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>

        {/* Compact top navigation — feed picker (dropdown) on the left, Media on the right */}
        <div className="grid grid-cols-2 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-small-target
                className={`relative flex items-center justify-center gap-1 pb-2 pt-0.5 text-[14px] transition-colors ${isFeedTab(activeTab) ? "font-bold text-foreground" : "text-muted-foreground"}`}
              >
                {currentFeedLabel}
                <ChevronDown className="h-3.5 w-3.5" />
                {isFeedTab(activeTab) && <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-foreground" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {feedTabs.map(tab => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className="flex items-center justify-between text-[13px]"
                >
                  {tab.label}
                  {activeTab === tab.id && <Check className="h-3.5 w-3.5 text-foreground" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            data-small-target
            onClick={() => handleTabChange("media")}
            className={`relative flex items-center justify-center gap-1.5 pb-2 pt-0.5 text-[14px] transition-colors ${activeTab === "media" ? "font-bold text-foreground" : "text-muted-foreground"}`}
          >
            <Newspaper className="h-3.5 w-3.5" />
            Media
            {activeTab === "media" && <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-foreground" />}
          </button>
        </div>
      </header>

      {/* Ticker rail */}
      {activeTab !== "media" && !searching && trendingTickers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 border-b border-border/40">
          {trendingTickers.map(t => (
            <button
              key={t.symbol}
              data-small-target
              onClick={() => setSearch(`$${t.symbol}`)}
              className="shrink-0 flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-muted/50 text-[11px] font-semibold text-muted-foreground"
            >
              <span className="text-primary">${t.symbol}</span>
              <span className="opacity-70 tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search results */}
      {activeTab !== "media" && searching && (
        <div className="border-b border-border/50">
          {people.length > 0 && (
            <div className="px-4 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">People</p>
              {people.map(p => (
                <button key={p.user_id} onClick={() => navigate(`/profile/${p.user_id}`)} className="w-full flex items-center gap-2.5 py-1.5 text-left">
                  <Avatar className="h-7 w-7"><AvatarImage src={p.avatar_url || ""} /><AvatarFallback className="text-[10px]">{getInitials(p.full_name)}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold truncate">{p.full_name || "Investor"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{atHandle(p as any)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {(tickerMatches.length > 0 || hashtagMatches.length > 0) && (
            <div className="px-4 py-2 border-t border-border/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Companies & topics</p>
              <div className="flex flex-wrap gap-1.5">
                {tickerMatches.map(sym => (
                  <button key={sym} data-small-target onClick={() => navigate(`/stock/${sym}`)} className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-muted/50 text-[11px]">
                    <Building2 className="h-3 w-3 text-primary" />
                    <span className="font-semibold text-primary">${sym}</span>
                    <span className="text-muted-foreground truncate max-w-[110px]">{NSE_NAMES[sym]}</span>
                  </button>
                ))}
                {hashtagMatches.map(tag => (
                  <button key={tag} data-small-target onClick={() => setSearch(tag)} className="flex items-center gap-1 h-7 px-2.5 rounded-full bg-muted/50 text-[11px] text-primary font-semibold">
                    <Hash className="h-3 w-3" />{tag.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-1.5 bg-muted/20">
            <p className="text-[11px] text-muted-foreground">Posts matching <span className="font-bold text-foreground">"{searchQuery}"</span></p>
            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={clearSearch}>Clear</Button>
          </div>
        </div>
      )}

      {/* Suggested people — ranked by shared TradersHub interests */}
      {activeTab === "for-you" && !searching && (
        <SuggestedForYou
          currentUserId={user?.id}
          myInterests={profile?.interests || []}
          followingIds={followingIds}
          onFollow={handleFollow}
        />
      )}

      {/* Feed */}
      {activeTab === "media" ? (
        <MediaFeed
          searchQuery={searchQuery}
          deepLinkArticleId={deepLinkArticleId}
          deepLinkReturnTo={returnTo}
          onDeepLinkConsumed={() => { setDeepLinkArticleId(null); updateParams({ article: null }); }}
        />
      ) : loading || !disclaimerDone ? (
        <PostSkeletonList count={6} />
      ) : feed.length === 0 ? (
        <div className="px-10 py-16 text-center">
          {activeTab === "following" ? (
            <>
              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm font-bold">Nothing here yet</p>
              <p className="text-[12px] text-muted-foreground mt-1">Follow investors to build this timeline.</p>
              <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => handleTabChange("for-you")}>Discover investors</Button>
            </>
          ) : activeTab === "trending" ? (
            <>
              <Flame className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm font-bold">No active discussions</p>
              <p className="text-[12px] text-muted-foreground mt-1">The most discussed posts show up here.</p>
            </>
          ) : (
            <>
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm font-bold">{searching ? "No matches" : "Start the conversation"}</p>
              <p className="text-[12px] text-muted-foreground mt-1">{searching ? "Try a different ticker, person or topic." : "Share your first idea with the community."}</p>
            </>
          )}
        </div>
      ) : (
        <div>
          {feed.map(post => (
            <HubPostCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              isFollowing={isFollowing(post.user_id)}
              onFollow={handleFollow}
              onOpen={p => navigate(`/traders-hub/post/${p.id}`)}
              onComment={p => navigate(`/traders-hub/post/${p.id}`)}
              onReact={handleReact}
              onBookmark={handleBookmark}
              onShare={handleShare}
              onDelete={async id => { const { error } = await deletePost(id); if (!error) toast({ title: "Post deleted" }); }}
              onEdit={p => { setEditing(p); setEditDraft(p.content); }}
              onReport={id => reportPost(id)}
              onHide={id => hidePost(id)}
            />
          ))}
          <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />You're all caught up
          </div>
        </div>
      )}

      {user && activeTab !== "media" && (
        <button
          aria-label="Create post"
          className="fixed bottom-24 right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          onClick={() => setComposeOpen(true)}
        >
          <Feather className="h-5 w-5" />
        </button>
      )}

      <XComposeModal
        open={composeOpen}
        onOpenChange={o => { setComposeOpen(o); if (!o) { setPrefillContent(""); setSharePreset(undefined); } }}
        user={user}
        profile={profile}
        sharePreset={sharePreset}
        onPost={async (content, imageUrl, quotedPostId) => {
          const { error } = await createPost(content, imageUrl, quotedPostId);
          if (error) { toast({ title: "Could not publish", variant: "destructive" }); return { error }; }
          toast({ title: "Posted to TradersHub" });
          return { error: null };
        }}
        portfolioSnapshot={portfolioSnapshot}
        prefillContent={prefillContent}
        isPremium={profile?.subscription_plan === 'premium' || profile?.subscription_plan === 'premium_plus'}
      />

      {/* Inline edit */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">Edit post</h3>
              <Button
                size="sm"
                className="h-8 rounded-full px-4 text-xs font-bold"
                disabled={!editDraft.trim()}
                onClick={async () => {
                  const { error } = await editPost(editing.id, editDraft.trim());
                  toast(error ? { title: "Edit failed", variant: "destructive" } : { title: "Post updated" });
                  setEditing(null);
                }}
              >
                Save
              </Button>
            </div>
            <textarea
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              maxLength={500}
              className="w-full min-h-[130px] bg-transparent text-[13.5px] leading-relaxed outline-none resize-none"
            />
            <p className="text-[11px] text-muted-foreground">Posts can be edited within 30 minutes of publishing.</p>
          </div>
        </div>
      )}
    </div>
  );
}