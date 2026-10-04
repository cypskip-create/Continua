import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePosts } from "@/hooks/usePosts";
import { classifyStockSentiment } from "@/lib/communitySentiment";
import { useMemo } from "react";
import { formatPostDate } from "@/lib/formatTimestamp";


interface Props { symbol: string }

export function CommunityTab({ symbol }: Props) {
  const navigate = useNavigate();
  const { posts } = usePosts();

  const relevant = useMemo(() => {
    const sym = symbol.toUpperCase();
    return (posts || []).filter(p =>
      (p.stock_mentions || []).map((s: string) => s.toUpperCase()).includes(sym) ||
      p.content?.toUpperCase().includes(`$${sym}`)
    );
  }, [posts, symbol]);

  const sentiment = useMemo(() => {
    const signals = relevant.map(p => classifyStockSentiment(p.content || '', symbol));
    const bull = signals.filter(s => s === 'bullish').length;
    const bear = signals.filter(s => s === 'bearish').length;
    const total = bull + bear;
    return { bullPct: total ? Math.round(bull / total * 100) : 0,
      bearPct: total ? 100 - Math.round(bull / total * 100) : 0,
      unclassified: signals.length - total };
  }, [relevant, symbol]);

  return (
    <div className="space-y-3">
      <Card className="soft-card">
        <CardContent className="p-4">
          <h4 className="text-xs font-bold mb-2">Community Sentiment</h4>
          <div className="flex items-center gap-2 text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-bull" />
            <span className="font-bold text-bull">{sentiment.bullPct}%</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-bull" style={{ width: `${sentiment.bullPct}%` }} />
              <div className="h-full bg-bear" style={{ width: `${sentiment.bearPct}%` }} />
            </div>
            <span className="font-bold text-bear">{sentiment.bearPct}%</span>
            <TrendingDown className="h-3.5 w-3.5 text-bear" />
          </div>
          <p className="text-[0.625rem] text-muted-foreground mt-1.5 text-center">Based on {relevant.length} recent TradersHub posts mentioning ${symbol}. {sentiment.unclassified} neutral or mixed; directional posts weighted equally.</p>
        </CardContent>
      </Card>

      {relevant.length === 0 ? (
        <Card className="soft-card">
          <CardContent className="p-6 text-center">
            <MessageSquare className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-semibold mb-1">Start the conversation</p>
            <p className="text-xs text-muted-foreground mb-3">No posts yet mention ${symbol}. Share your thesis.</p>
            <Button className="rounded-full" size="sm" onClick={() => navigate(`/traders-hub?compose=true&ticker=${symbol}`)}>
              Post on TradersHub
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {relevant.slice(0, 6).map(p => (
            <Card key={p.id} className="soft-card cursor-pointer active:scale-[0.99] transition-transform" onClick={() => navigate(`/traders-hub/post/${p.id}`)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold truncate">
                    {p.author?.full_name || "User"}
                    {(p.author as any)?.handle && (
                      <span className="font-normal text-muted-foreground"> @{(p.author as any).handle}</span>
                    )}
                  </p>
                  <span className="text-[0.625rem] text-muted-foreground shrink-0">{formatPostDate(p.created_at)}</span>
                </div>
                <p className="text-xs line-clamp-3">{p.content}</p>
                <div className="flex gap-3 mt-2 text-[0.625rem] text-muted-foreground">
                  <span>♥ {p.likes_count || 0}</span>
                  <span>💬 {p.comments_count || 0}</span>
                  <span>↻ {p.reposts_count || 0}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" className="w-full rounded-full" size="sm" onClick={() => navigate(`/traders-hub?search=$${symbol}`)}>
            View all ${symbol} discussions on TradersHub
          </Button>
        </div>

      )}
    </div>
  );
}
