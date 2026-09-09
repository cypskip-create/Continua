import { useState, useEffect, useRef, useMemo } from "react";
import { Users, Trophy, MessageCircle, BookOpen, TrendingUp, Hash, Play, PieChart, Coffee, Heart, Repeat2, UserPlus, Flame, ChevronRight, Share2, Bookmark, MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopBar } from "@/components/shared/TopBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { usePosts, Post } from "@/hooks/usePosts";
import { useFollows } from "@/hooks/useFollows";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { StockHeatmap } from "@/components/home/StockHeatmap";
import { usePortfolio } from "@/hooks/usePortfolio";
import { STOCK_META, computePortfolioStats } from "@/lib/stockPrices";
import { useLivePortfolioQuotes, useLiveQuotes } from "@/hooks/useLiveQuotes";
import { shareLink } from "@/lib/share";

interface TopTrader {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  posts_count: number;
}

const TRENDING_SYMBOLS = Object.keys(STOCK_META).filter(symbol => symbol !== "SCOM");

export default function Discover() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { posts, loading: postsLoading, likePost, repostPost, bookmarkPost } = usePosts();
  const { isFollowing, toggleFollow } = useFollows();
  const [feedTab, setFeedTab] = useState("latest");
  const [topTraders, setTopTraders] = useState<TopTrader[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);

  const { portfolio, loading: portfolioLoading } = usePortfolio();
  const { liveQuotes } = useLivePortfolioQuotes(portfolio.map(h => h.symbol));
  const portfolioStats = computePortfolioStats(portfolio, liveQuotes);
  const portfolioWithLive = portfolio
    .map(h => {
      const live = liveQuotes[h.symbol.toUpperCase()];
      if (!live) return null; // no live price yet — excluded rather than defaulted to a fabricated/zero gain
      return { ...h, gainPct: h.avg_cost > 0 ? ((live.price - h.avg_cost) / h.avg_cost) * 100 : 0 };
    })
    .filter((h): h is NonNullable<typeof h> => h !== null);
  const topGainerHolding = portfolioWithLive.length > 0 ? [...portfolioWithLive].sort((a, b) => b.gainPct - a.gainPct)[0] : null;

  // Trending = today's biggest movers, from live Continua Data Layer quotes
  // only — a symbol with no live quote yet is excluded, never fabricated.
  const { quotes: trendingQuotes } = useLiveQuotes(TRENDING_SYMBOLS);
  const trendingStocks = useMemo(() => {
    return TRENDING_SYMBOLS
      .map(symbol => {
        const q = trendingQuotes[symbol];
        if (!q) return null;
        return { symbol, price: q.lastPrice, pct: q.changePercent, isUp: q.changePercent >= 0 };
      })
      .filter((s): s is { symbol: string; price: number; pct: number; isUp: boolean } => s !== null)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 10)
      .map(s => ({ symbol: s.symbol, price: s.price, change: `${s.isUp ? '+' : ''}${s.pct.toFixed(2)}%`, isUp: s.isUp }));
  }, [trendingQuotes]);

  const courses = [
    { title: "Stock Market Basics", progress: 0, lessons: 12, duration: "2 hours", level: "Beginner", type: "video" },
    { title: "Technical Analysis", progress: 40, lessons: 8, duration: "3 hours", level: "Intermediate", type: "text" },
    { title: "Portfolio Management", progress: 100, lessons: 10, duration: "2.5 hours", level: "Advanced", type: "audio" },
  ];

  useEffect(() => {
    fetchTopTraders();
  }, []);

  const fetchTopTraders = async () => {
    const { data: profiles } = await supabase
      .from('profiles_public')
      .select('id, user_id, full_name, avatar_url')
      .limit(10);

    if (profiles) {
      const tradersWithCounts = await Promise.all(
        profiles.map(async (profile) => {
          const { count } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', profile.user_id);
          return { ...profile, posts_count: count || 0 };
        })
      );
      setTopTraders(
        tradersWithCounts
          .sort((a, b) => b.posts_count - a.posts_count)
          .slice(0, 5)
      );
    }
  };

  const getFilteredPosts = () => {
    let filtered = [...posts];
    if (feedTab === "latest") {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (feedTab === "top") {
      filtered.sort((a, b) => (b.likes_count + b.reposts_count) - (a.likes_count + a.reposts_count));
    } else if (feedTab === "following") {
      filtered = filtered.filter(post => isFollowing(post.user_id));
    }
    return filtered.slice(0, 12);
  };

  const filteredPosts = getFilteredPosts();

  const handleLike = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    await likePost(postId);
  };

  const handleRepost = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    const { error } = await repostPost(postId);
    if (!error) toast({ title: "Reposted to your profile" });
  };

  const handleBookmark = async (e: React.MouseEvent, post: Post) => {
    e.stopPropagation();
    if (!user) { navigate('/auth'); return; }
    const { error } = await bookmarkPost(post.id, !!post.is_bookmarked);
    if (!error) toast({ title: post.is_bookmarked ? "Removed from bookmarks" : "Saved to bookmarks" });
  };

  const handleShare = async (e: React.MouseEvent, post: Post) => {
    e.stopPropagation();
    const url = `${window.location.origin}/traders-hub/post/${post.id}`;
    const result = await shareLink(url, { title: "Continua TradersHub", text: post.content.slice(0, 120) });
    if (result.method === "clipboard") toast({ title: "Link copied" });
    else if (result.method === "failed") toast({ title: "Couldn't share this post", variant: "destructive" });
  };

  const handleFollow = async (targetUserId: string) => {
    if (!user) { navigate('/auth'); return; }
    const { error } = await toggleFollow(targetUserId);
    if (!error) {
      toast({ title: isFollowing(targetUserId) ? "Unfollowed" : "Following!" });
    }
  };

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const renderPostContent = (content: string) => {
    return content.split(/(\$[A-Z]+|#\w+)/g).map((part, i) => {
      if (part.startsWith('$')) {
        return (
          <span key={i} className="text-primary font-medium cursor-pointer hover:underline"
            onClick={(e) => { e.stopPropagation(); navigate(`/stock/${part.slice(1)}`); }}>
            {part}
          </span>
        );
      } else if (part.startsWith('#')) {
        return <span key={i} className="text-primary cursor-pointer hover:underline">{part}</span>;
      }
      return part;
    });
  };

  // Duplicate tickers for seamless loop
  const tickerItems = [...trendingStocks, ...trendingStocks];

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar 
        title="Discover" 
        subtitle="Social investing & learning"
        showSearch={true}
        showNotifications={true}
      />

      {/* Auto-scrolling Trending Ticker */}
      <div className="border-b border-border/50 overflow-hidden bg-card/50">
        <div className="flex items-center gap-6 py-2 px-4 animate-ticker whitespace-nowrap" ref={tickerRef}>
          {tickerItems.map((s, i) => (
            <button
              key={`${s.symbol}-${i}`}
              className="inline-flex items-center gap-1.5 shrink-0 tap-scale"
              onClick={() => navigate(`/stock/${s.symbol}`)}
            >
              <span className="text-xs font-bold">${s.symbol}</span>
              <span className="text-[10px] text-muted-foreground">{s.price}</span>
              <span className={`text-[10px] font-semibold ${s.isUp ? 'text-bull' : 'text-bear'}`}>
                {s.change}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-5 stagger-children">
        {/* Discover Stocks — heatmap for spotting movers at a glance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-accent" />
              Discover Stocks
            </h3>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate('/markets')}>
              See all <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          <StockHeatmap />
        </div>

        {/* Portfolio Insights Card — real data, only shown if the user actually holds something */}
        {!portfolioLoading && portfolio.length > 0 && (
          <Card className="card-hero cursor-pointer" onClick={() => navigate('/track-investments')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Trophy className="h-5 w-5 text-accent" />
                  <h3 className="font-semibold text-sm">Portfolio Insights</h3>
                </div>
                <Badge variant="secondary" className={`text-xs ${portfolioStats.gainPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {portfolioStats.gainPct >= 0 ? '+' : ''}{portfolioStats.gainPct.toFixed(1)}%
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-1">Top Holdings</div>
                  <div className="flex space-x-1">
                    {portfolio.slice(0, 3).map((h) => (
                      <Badge key={h.symbol} variant="outline" className="text-xs px-1">{h.symbol}</Badge>
                    ))}
                  </div>
                  {topGainerHolding && (
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Best: </span>
                      <span className={`font-medium ${topGainerHolding.gainPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {topGainerHolding.symbol} {topGainerHolding.gainPct >= 0 ? '+' : ''}{topGainerHolding.gainPct.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center">
                  <PieChart className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2-Column Grid of Main Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="card-gradient cursor-pointer tap-scale" onClick={() => navigate('/traders-hub')}>
            <CardContent className="p-3.5">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">TradersHub</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-2.5">Connect & interact with traders</p>
              <div className="text-xs flex items-center space-x-1 text-accent">
                <Users className="h-3 w-3" />
                <span>1.2K active traders</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-gradient cursor-pointer tap-scale" onClick={() => navigate('/learn')}>
            <CardContent className="p-3.5">
              <div className="flex items-center space-x-2 mb-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Learn</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-2.5">Investment courses & guides</p>
              <div className="text-xs flex items-center space-x-1 text-accent">
                <Play className="h-3 w-3" />
                <span>12 courses available</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-gradient cursor-pointer tap-scale" onClick={() => navigate('/track-investments')}>
            <CardContent className="p-3.5">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">My Investments</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-2.5">Track your portfolio</p>
              <div className="text-xs flex items-center space-x-1 text-accent">
                <PieChart className="h-3 w-3" />
                <span>View holdings</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-gradient cursor-pointer tap-scale" onClick={() => navigate('/rooms')}>
            <CardContent className="p-3.5">
              <div className="flex items-center space-x-2 mb-2">
                <Hash className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Rooms</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-2.5">Real-time trading rooms</p>
              <div className="text-xs flex items-center space-x-1 text-accent">
                <Coffee className="h-3 w-3" />
                <span>3 active rooms</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feed / Learn / Top Traders Tabs */}
        <Tabs defaultValue="hub" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-10">
            <TabsTrigger value="hub" className="text-xs font-semibold">Feed</TabsTrigger>
            <TabsTrigger value="learn" className="text-xs font-semibold">Learn</TabsTrigger>
            <TabsTrigger value="insights" className="text-xs font-semibold">Top Traders</TabsTrigger>
          </TabsList>

          {/* TradersHub Feed */}
          <TabsContent value="hub" className="space-y-0 mt-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex space-x-1.5">
                {["latest", "top", "following"].map(tab => (
                  <Button 
                    key={tab}
                    variant={feedTab === tab ? "default" : "ghost"} 
                    size="sm" 
                    className="text-xs h-8 rounded-full capitalize"
                    onClick={() => setFeedTab(tab)}
                  >
                    {tab}
                  </Button>
                ))}
              </div>
              <Button size="sm" className="text-xs h-8 rounded-full" onClick={() => navigate('/traders-hub')}>
                <MessageCircle className="h-3 w-3 mr-1" />
                Post
              </Button>
            </div>

            {postsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/30 border-t-primary" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <Card className="card-gradient">
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    {feedTab === "following" 
                      ? "Follow traders to see their posts here" 
                      : "No posts yet. Be the first to share!"}
                  </p>
                  <Button className="mt-3" size="sm" onClick={() => navigate('/traders-hub')}>
                    Go to TradersHub
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredPosts.map((post) => (
                  <div 
                    key={post.id} 
                    className="py-3 cursor-pointer active:bg-muted/20 transition-colors"
                    onClick={() => navigate(`/traders-hub/post/${post.id}`)}
                  >
                    <div className="flex items-start space-x-3">
                      <Avatar 
                        className="h-9 w-9 cursor-pointer shrink-0"
                        onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}
                      >
                        <AvatarImage src={post.author?.avatar_url || ""} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {getInitials(post.author?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span 
                            className="font-semibold text-sm cursor-pointer hover:underline truncate"
                            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}
                          >
                            {post.author?.full_name || 'User'}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            · {formatTimeAgo(post.created_at)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed mb-2.5">{renderPostContent(post.content)}</p>
                        
                        {/* X-style interaction bar */}
                        <div className="flex items-center justify-between max-w-[280px] text-muted-foreground">
                          <button
                            className="flex items-center gap-1 text-xs hover:text-primary transition-colors group"
                            onClick={(e) => { e.stopPropagation(); navigate(`/traders-hub/post/${post.id}`); }}
                          >
                            <MessageCircle className="h-3.5 w-3.5 group-hover:bg-primary/10 rounded-full p-0" />
                            <span>{post.comments_count}</span>
                          </button>
                          <button
                            className={`flex items-center gap-1 text-xs transition-colors group ${post.is_reposted ? 'text-bull' : 'hover:text-bull'}`}
                            onClick={(e) => handleRepost(e, post.id)}
                          >
                            <Repeat2 className="h-3.5 w-3.5" />
                            <span>{post.reposts_count}</span>
                          </button>
                          <button
                            className={`flex items-center gap-1 text-xs transition-colors group ${post.is_liked ? 'text-red-500' : 'hover:text-red-500'}`}
                            onClick={(e) => handleLike(e, post.id)}
                          >
                            <Heart className={`h-3.5 w-3.5 transition-transform ${post.is_liked ? 'fill-current scale-110' : 'group-hover:scale-110'}`} />
                            <span>{post.likes_count}</span>
                          </button>
                          <button
                            className={`flex items-center gap-1 text-xs transition-colors ${post.is_bookmarked ? 'text-primary' : 'hover:text-primary'}`}
                            onClick={(e) => handleBookmark(e, post)}
                          >
                            <Bookmark className={`h-3.5 w-3.5 ${post.is_bookmarked ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            className="flex items-center gap-1 text-xs hover:text-primary transition-colors"
                            onClick={(e) => handleShare(e, post)}
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Learn Courses */}
          <TabsContent value="learn" className="space-y-3 mt-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex space-x-1.5">
                <Button variant="outline" size="sm" className="text-xs h-8 rounded-full">Beginner</Button>
                <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full">Intermediate</Button>
                <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full">Advanced</Button>
              </div>
              <Button size="sm" className="text-xs h-8 rounded-full" onClick={() => navigate('/learn')}>
                View All
              </Button>
            </div>

            {courses.map((course, index) => (
              <Card key={index} className="soft-card cursor-pointer tap-scale" onClick={() => navigate('/learn')}>
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-sm">{course.title}</h4>
                      <Badge variant="outline" className="text-[10px] px-1.5 rounded-full">{course.level}</Badge>
                    </div>
                    <div className="flex items-center space-x-1">
                      {course.type === 'video' && <Play className="h-3 w-3" />}
                      {course.type === 'text' && <BookOpen className="h-3 w-3" />}
                      {course.type === 'audio' && <Coffee className="h-3 w-3" />}
                      <span className="text-xs text-muted-foreground">{course.duration}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{course.lessons} lessons</span>
                    <span className="text-xs text-primary font-medium">{course.progress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div 
                      className="bg-primary rounded-full h-1.5 transition-all"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Top Traders */}
          <TabsContent value="insights" className="space-y-3 mt-4">
            {topTraders.length === 0 ? (
              <Card className="soft-card">
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground text-sm">No traders to show yet</p>
                </CardContent>
              </Card>
            ) : (
              topTraders.map((trader) => (
                <Card key={trader.id} className="soft-card tap-scale">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center space-x-3 cursor-pointer"
                        onClick={() => navigate(`/profile/${trader.user_id}`)}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={trader.avatar_url || ""} />
                          <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                            {getInitials(trader.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-sm">{trader.full_name || "Trader"}</div>
                          <div className="text-xs text-muted-foreground">{trader.posts_count} posts</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {user && user.id !== trader.user_id && (
                          <Button 
                            variant={isFollowing(trader.user_id) ? "outline" : "default"} 
                            size="sm" 
                            className="text-xs h-8 rounded-full"
                            onClick={() => handleFollow(trader.user_id)}
                          >
                            {isFollowing(trader.user_id) ? "Following" : (
                              <>
                                <UserPlus className="h-3 w-3 mr-1" />
                                Follow
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}