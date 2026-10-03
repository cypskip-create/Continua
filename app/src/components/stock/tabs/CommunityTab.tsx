import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePosts } from "@/hooks/usePosts";
import { useMemo } from "react";
import { formatPostDate } from "@/lib/formatTimestamp";


interface Props { symbol: string }

// Sentiment: scan each relevant post for bull/bear language — not just the literal
// word "bullish"/"bearish", but the broader vocabulary traders actually use (buy/sell
// calls, price-action slang, analyst-style terms, and common emoji shorthand).
// Single words are matched on word boundaries (so "up" doesn't match inside "group"),
// phrases and emoji are matched as substrings.
const BULLISH_TERMS = [
  "bull", "bullish", "buy", "buying", "long", "growth", "moon", "mooning", "to the moon",
  "up", "uptrend", "strong", "breakout", "rally", "rallying", "undervalued", "accumulate",
  "accumulating", "green", "pump", "pumping", "outperform", "upgrade", "strong buy",
  "buy the dip", "loading up", "all in", "diamond hands", "surge", "surging", "soar",
  "soaring", "rocket", "gains", "beat expectations", "upside", "positive outlook",
  "overweight", "recommend buy", "🚀", "📈",
];
const BEARISH_TERMS = [
  "bear", "bearish", "sell", "selling", "short", "shorting", "drop", "dropping", "down",
  "downtrend", "weak", "crash", "crashing", "dump", "dumping", "overvalued", "red",
  "downgrade", "underperform", "panic sell", "sell off", "correction", "bag holder",
  "rug pull", "decline", "declining", "plunge", "plunging", "slump", "downside",
  "miss expectations", "tank", "tanking", "negative outlook", "underweight",
  "recommend sell", "🔻", "📉",
];
const countMatches = (text: string, terms: string[]) =>
  terms.reduce((count, term) => {
    const isPhraseOrSymbol = /\s/.test(term) || !/^[a-z]+$/i.test(term);
    const hit = isPhraseOrSymbol ? text.includes(term) : new RegExp(`\\b${term}\\b`, "i").test(text);
    return hit ? count + 1 : count;
  }, 0);

export function CommunityTab({ symbol }: Props) {
  const navigate = useNavigate();
  const { posts } = usePosts();

  const relevant = useMemo(() => {
    const sym = symbol.toUpperCase();
    return (posts || []).filter(p =>
      (p.stock_mentions || []).map((s: string) => s.toUpperCase()).includes(sym) ||
      p.content?.toUpperCase().includes(`$${sym}`)
    ).slice(0, 6);
  }, [posts, symbol]);

  // Sentiment: scan each relevant post for bull/bear language — not just the literal
  // word "bullish"/"bearish", but the broader vocabulary traders actually use (buy/sell
  // calls, price-action slang, analyst-style terms, and common emoji shorthand).
  // Single words are matched on word boundaries (so "up" doesn't match inside "group"),
  // phrases and emoji are matched as substrings.
  const sentiment = useMemo(() => {
    let bull = 0, bear = 0;
    relevant.forEach(p => {
      const c = (p.content || "").toLowerCase();
      bull += countMatches(c, BULLISH_TERMS);
      bear += countMatches(c, BEARISH_TERMS);
    });
    const total = bull + bear || 1;
    return { bullPct: Math.round((bull / total) * 100), bearPct: Math.round((bear / total) * 100) };
  }, [relevant]);

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
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Based on {relevant.length} recent TradersHub posts mentioning ${symbol}</p>
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
          {relevant.map(p => (
            <Card key={p.id} className="soft-card cursor-pointer active:scale-[0.99] transition-transform" onClick={() => navigate(`/traders-hub/post/${p.id}`)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold truncate">
                    {p.author?.full_name || "User"}
                    {(p.author as any)?.handle && (
                      <span className="font-normal text-muted-foreground"> @{(p.author as any).handle}</span>
                    )}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatPostDate(p.created_at)}</span>
                </div>
                <p className="text-xs line-clamp-3">{p.content}</p>
                <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
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
