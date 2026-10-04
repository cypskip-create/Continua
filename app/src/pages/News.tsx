import { useIndices } from "@/hooks/useIndices";
import { useState } from "react";
import { 
  Newspaper, Clock, TrendingUp, Bookmark, BookmarkCheck,
  Play, Share2, MessageCircle, Bell, ChevronRight,
  Flame, Globe, BarChart3, Zap, Eye, Search
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NewsDetailDialog } from "@/components/news/NewsDetailDialog";
import { LiveConferencePlayer } from "@/components/news/LiveConferencePlayer";

interface NewsArticle {
  id: number; title: string; summary: string; source: string; time: string;
  category: string; imageUrl: string; readTime?: string; views?: number;
  comments?: number; hasVideo?: boolean; stockMentions?: string[];
  isPremium?: boolean; isBreaking?: boolean; sentiment?: "bullish" | "bearish" | "neutral";
}

export default function News() {
  const { indices } = useIndices();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [savedArticles, setSavedArticles] = useState<number[]>([]);
  const [followedTopics] = useState<string[]>(["earnings", "stocks"]);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [livePlayerOpen, setLivePlayerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showBookmarks, setShowBookmarks] = useState(false);

  const tabs = [
    { id: "for-you", label: "For You", icon: Zap },
    { id: "latest", label: "All", icon: Clock },
    { id: "trending", label: "Trending", icon: Flame },
    { id: "stocks", label: "My Stocks", icon: BarChart3 },
    { id: "economy", label: "Kenya", icon: Globe },
    { id: "earnings", label: "Earnings", icon: TrendingUp },
    { id: "bookmarks", label: "Saved", icon: Bookmark },
  ];

  const liveNews = { isLive: true, title: "LIVE: CBK Press Conference on Monetary Policy", viewers: 1243, source: "CBK Official" };
  const breakingNews: NewsArticle = {
    id: 0, title: "KCB Group announces strategic partnership with fintech startup",
    summary: "Major banking group partners with leading fintech to revolutionize digital banking", source: "Capital Markets",
    time: "Just now", category: "latest", imageUrl: "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=400&h=250&fit=crop",
    isBreaking: true, readTime: "3 min", views: 12450, comments: 89, sentiment: "bullish",
  };

  const newsItems: NewsArticle[] = [
    { id: 1, title: "Safaricom Reports Strong Q3 Results, M-Pesa Revenue Surges 23%", summary: "Kenya's largest telco posts 12% growth in revenue driven by M-Pesa expansion", source: "Business Daily", time: "2h ago", category: "earnings", imageUrl: "https://images.unsplash.com/photo-1556155092-490a1ba16284?w=400&h=250&fit=crop", readTime: "5 min", views: 8920, comments: 56, hasVideo: true, stockMentions: ["SCOM"], sentiment: "bullish" },
    { id: 2, title: "NSE 20 Index Hits New Monthly High on Banking Rally", summary: "Banking and telecom sectors lead market rally amid positive investor sentiment", source: "Capital FM", time: "4h ago", category: "trending", imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=250&fit=crop", readTime: "4 min", views: 6540, comments: 42, stockMentions: ["EQTY", "KCB", "COOP"], sentiment: "bullish" },
    { id: 3, title: "Central Bank Maintains Rates at 12.5% Amid Stable Inflation", summary: "CBK keeps policy rate unchanged citing stable inflation outlook", source: "The Star", time: "6h ago", category: "economy", imageUrl: "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=400&h=250&fit=crop", readTime: "6 min", views: 4320, comments: 78, sentiment: "neutral" },
    { id: 4, title: "Equity Bank Expands to South Sudan in Regional Push", summary: "Regional banking group opens new subsidiary as part of aggressive expansion strategy", source: "Standard", time: "8h ago", category: "stocks", imageUrl: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=250&fit=crop", readTime: "4 min", views: 3890, comments: 34, stockMentions: ["EQTY"], sentiment: "bullish" },
    { id: 5, title: "Analysis: What Rising Global Oil Prices Mean for Kenya Power", summary: "Expert analysis on impact of geopolitical tensions on energy costs", source: "Reuters", time: "10h ago", category: "stocks", imageUrl: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=400&h=250&fit=crop", readTime: "8 min", views: 2450, comments: 23, stockMentions: ["KPLC", "KEGN"], isPremium: true, sentiment: "bearish" },
  ];

  const trendingTopics = [
    { tag: "#NSEMomentum", count: "2.4K" },
    { tag: "#Safaricom", count: "1.8K" },
    { tag: "#KenyaEconomy", count: "1.2K" },
    { tag: "#Earnings2024", count: "890" },
  ];

  const toggleSave = (id: number) => {
    setSavedArticles(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
    toast({ title: savedArticles.includes(id) ? "Removed from bookmarks" : "Bookmarked!" });
  };

  const filteredNews = (category: string) => {
    if (category === "bookmarks") {
      return newsItems.filter(item => savedArticles.includes(item.id));
    }
    let items = newsItems;
    if (category === "for-you") {
      // Include bookmarked articles in For You feed + followed topics
      items = newsItems.filter(item => followedTopics.some(topic => item.category === topic) || savedArticles.includes(item.id));
    }
    else if (category !== "latest" && category !== "trending") items = newsItems.filter(item => item.category === category);
    if (searchQuery) items = items.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return items;
  };

  const getSentimentColor = (s?: string) => {
    if (s === "bullish") return "bg-bull/10 text-bull";
    if (s === "bearish") return "bg-bear/10 text-bear";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">News</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-full relative ${showBookmarks ? 'bg-primary/10' : ''}`}
              onClick={() => setShowBookmarks(!showBookmarks)}
            >
              {showBookmarks ? <BookmarkCheck className="h-[18px] w-[18px] text-primary" /> : <Bookmark className="h-[18px] w-[18px]" />}
              {savedArticles.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary text-[0.625rem] flex items-center justify-center text-primary-foreground font-bold">
                  {savedArticles.length}
                </span>
              )}
            </Button>
          </div>
        </div>
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search news..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-full bg-muted/50 border-0 text-sm"
            />
          </div>
        </div>
      </header>

      <div className="px-4 pt-3 space-y-4">
        {/* Bookmarks View */}
        {showBookmarks ? (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <BookmarkCheck className="h-4 w-4 text-primary" />
                Saved Articles ({savedArticles.length})
              </h2>
              <Button variant="ghost" size="sm" className="text-xs h-7 rounded-full" onClick={() => setShowBookmarks(false)}>
                Back to Feed
              </Button>
            </div>
            {savedArticles.length === 0 ? (
              <Card className="soft-card">
                <CardContent className="p-8 text-center">
                  <Bookmark className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="font-semibold text-sm mb-1">No saved articles</p>
                  <p className="text-xs text-muted-foreground">Tap the bookmark icon on any article to save it here</p>
                </CardContent>
              </Card>
            ) : (
              filteredNews("bookmarks").map((article) => (
                <Card key={article.id} className="soft-card overflow-hidden cursor-pointer" onClick={() => { setSelectedArticle(article); setDetailDialogOpen(true); }}>
                  <div className="flex">
                    <div className="relative w-28 shrink-0">
                      <img src={article.imageUrl} alt="" className="w-full h-full object-cover min-h-[110px] rounded-l-2xl" />
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[0.6875rem] font-semibold text-primary">{article.source}</span>
                          <span className="text-[0.6875rem] text-muted-foreground">{article.time}</span>
                        </div>
                        <h2 className="font-bold text-xs leading-snug line-clamp-2">{article.title}</h2>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{((article.views || 0) / 1000).toFixed(1)}K</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.stopPropagation(); toggleSave(article.id); }}>
                          <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Live Banner */}
            {liveNews.isLive && (
              <Card className="bg-gradient-to-r from-destructive/8 to-transparent border-destructive/20 animate-fade-in">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge className="bg-destructive text-destructive-foreground text-[0.625rem] px-2 py-0.5 rounded-full shrink-0">
                      <span className="w-1.5 h-1.5 bg-destructive-foreground rounded-full animate-pulse mr-1 inline-block" />
                      LIVE
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{liveNews.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {liveNews.source} · <Eye className="h-3 w-3" />{liveNews.viewers.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-destructive hover:bg-destructive/90 h-8 rounded-full shrink-0" onClick={() => setLivePlayerOpen(true)}>
                    <Play className="h-3 w-3 mr-1" />Watch
                  </Button>
                </CardContent>
              </Card>
            )}

            <LiveConferencePlayer conference={liveNews} open={livePlayerOpen} onClose={() => setLivePlayerOpen(false)} />

            {/* Breaking News */}
            <Card 
              className="soft-card border-0 overflow-hidden cursor-pointer animate-fade-in"
              onClick={() => { setSelectedArticle(breakingNews); setDetailDialogOpen(true); }}
            >
              <div className="relative">
                <img src={breakingNews.imageUrl} alt={breakingNews.title} className="w-full h-44 object-cover rounded-t-2xl" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent rounded-t-2xl" />
                <div className="absolute top-3 left-3 flex gap-2">
                  <Badge className="bg-destructive text-destructive-foreground text-[0.625rem] px-2.5 py-0.5 rounded-full">BREAKING</Badge>
                  {breakingNews.sentiment && (
                    <Badge className={`text-[0.625rem] px-2 py-0.5 rounded-full border-0 ${getSentimentColor(breakingNews.sentiment)}`}>
                      {breakingNews.sentiment === "bullish" ? "↑ Bullish" : breakingNews.sentiment === "bearish" ? "↓ Bearish" : "Neutral"}
                    </Badge>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h2 className="text-white font-bold text-sm leading-snug mb-1.5">{breakingNews.title}</h2>
                  <div className="flex items-center gap-2 text-white/70 text-xs">
                    <span className="font-medium text-white">{breakingNews.source}</span>
                    <span>·</span>
                    <span>{breakingNews.time}</span>
                    <span>·</span>
                    <span>{breakingNews.readTime}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Market Pulse Strip */}
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">Market Pulse</h2>
                <span className="text-[0.625rem] text-muted-foreground ml-auto">Published indices</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {indices.map(index => ({ label: index.code, value: index.value.toFixed(2), change: `${index.changePercent.toFixed(2)}%`, up: index.changePercent >= 0 })).map(m => (
                  <Card key={m.label} className="soft-card">
                    <CardContent className="p-2.5">
                      <p className="text-[0.625rem] text-muted-foreground">{m.label}</p>
                      <p className="text-sm font-bold tabular-nums leading-tight mt-0.5">{m.value}</p>
                      <p className={`text-[0.625rem] font-semibold ${m.up ? 'text-bull' : 'text-bear'}`}>{m.change}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Trending Topics */}
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Flame className="h-4 w-4 text-accent" />
                  Trending
                </h2>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {trendingTopics.map((topic, idx) => (
                  <Badge key={idx} variant="secondary" className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors py-1.5 px-3 text-xs rounded-full whitespace-nowrap" onClick={() => navigate(`/traders-hub?search=${encodeURIComponent(topic.tag)}`)}>
                    {topic.tag}
                    <span className="ml-1.5 text-muted-foreground">{topic.count}</span>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Most Discussed */}
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Most Discussed
                </h2>
                <button className="text-[0.6875rem] text-primary font-medium" onClick={() => navigate('/traders-hub')}>See all</button>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {newsItems.slice(0, 4).map(article => (
                  <Card key={`md-${article.id}`} className="soft-card overflow-hidden cursor-pointer shrink-0 w-44"
                        onClick={() => { setSelectedArticle(article); setDetailDialogOpen(true); }}>
                    <img src={article.imageUrl} alt="" className="w-full h-20 object-cover" />
                    <div className="p-2">
                      <p className="text-[0.625rem] text-primary font-semibold">{article.source}</p>
                      <h4 className="text-[0.6875rem] font-bold leading-snug line-clamp-2 mt-0.5">{article.title}</h4>
                      <div className="flex items-center gap-2 mt-1.5 text-[0.625rem] text-muted-foreground">
                        <span className="flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" />{article.comments}</span>
                        <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{((article.views || 0) / 1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* News Tabs */}
            <Tabs defaultValue="for-you" className="w-full animate-fade-in">
              <ScrollArea className="w-full">
                <TabsList className="inline-flex h-10 w-max bg-muted/40 p-1 rounded-full gap-0.5">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5 px-3.5 text-xs rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">
                      <tab.icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>

              {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="space-y-3 mt-3">
                  {filteredNews(tab.id).length === 0 ? (
                    <Card className="soft-card">
                      <CardContent className="p-8 text-center">
                        {tab.id === "bookmarks" ? (
                          <>
                            <Bookmark className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="font-semibold text-sm mb-1">No saved articles</p>
                            <p className="text-xs text-muted-foreground">Bookmark articles to find them here</p>
                          </>
                        ) : (
                          <>
                            <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="font-semibold text-sm mb-1">No articles</p>
                            <p className="text-xs text-muted-foreground">Follow topics to see personalized news</p>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    filteredNews(tab.id).map((article) => (
                      <Card key={article.id} className="soft-card overflow-hidden cursor-pointer" onClick={() => { setSelectedArticle(article); setDetailDialogOpen(true); }}>
                        <div className="flex">
                          <div className="relative w-28 shrink-0">
                            <img src={article.imageUrl} alt="" className="w-full h-full object-cover min-h-[110px] rounded-l-2xl" />
                            {article.hasVideo && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-l-2xl">
                                <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                  <Play className="h-3.5 w-3.5 text-foreground ml-0.5" />
                                </div>
                              </div>
                            )}
                            {article.isPremium && (
                              <Badge className="absolute top-2 left-2 bg-accent text-accent-foreground text-[0.5625rem] px-1.5 py-0 rounded-full">PRO</Badge>
                            )}
                          </div>
                          <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[0.6875rem] font-semibold text-primary">{article.source}</span>
                                <span className="text-[0.6875rem] text-muted-foreground">{article.time}</span>
                              </div>
                              <h2 className="font-bold text-xs leading-snug line-clamp-2 mb-1.5">{article.title}</h2>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {article.sentiment && (
                                  <Badge className={`text-[0.5625rem] px-1.5 py-0 rounded-full border-0 ${getSentimentColor(article.sentiment)}`}>
                                    {article.sentiment === "bullish" ? "↑ Bullish" : article.sentiment === "bearish" ? "↓ Bearish" : "—"}
                                  </Badge>
                                )}
                                {article.stockMentions?.slice(0, 2).map((stock) => (
                                  <Badge key={stock} variant="outline" className="text-[0.5625rem] px-1.5 py-0 rounded-full cursor-pointer hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); navigate(`/stock/${stock}`); }}>
                                    ${stock}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                                <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{((article.views || 0) / 1000).toFixed(1)}K</span>
                                <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{article.comments}</span>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.stopPropagation(); toggleSave(article.id); }}>
                                {savedArticles.includes(article.id) ? <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> : <Bookmark className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>

            {/* Personalization */}
            <Card className="soft-card border-primary/20 animate-fade-in">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Bell className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm">Personalized News</h4>
                      <p className="text-[0.6875rem] text-muted-foreground truncate">Follow topics you care about</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs shrink-0 rounded-full">Customize</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <NewsDetailDialog article={selectedArticle} open={detailDialogOpen} onOpenChange={setDetailDialogOpen} savedArticles={savedArticles} onToggleSave={toggleSave} />
    </div>
  );
}
