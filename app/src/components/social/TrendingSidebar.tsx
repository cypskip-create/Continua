import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, Verified } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { getStockName } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Skeleton } from "@/components/ui/skeleton";

// Only the selection of which symbols to feature is curated here — their
// price/name/change all come from the canonical data at render time.
const TRENDING_SYMBOLS = ["SCOM", "EQTY", "KCB", "EABL", "ABSA"];

const TRENDING_TOPICS = [
  { tag: "#NSE20", posts: "1.2K" },
  { tag: "#SafaricomEarnings", posts: "834" },
  { tag: "#KenyanStocks", posts: "567" },
  { tag: "#DividendSeason", posts: "423" },
  { tag: "#BullishKenya", posts: "312" },
];

const SUGGESTED_USERS = [
  { id: "1", name: "Jane Wanjiku", handle: "janewanjiku", avatar: "", bio: "NSE Analyst | 78% win rate" },
  { id: "2", name: "David Ochieng", handle: "davidochieng", avatar: "", bio: "Portfolio Manager | EQTY Bull" },
  { id: "3", name: "Amina Hassan", handle: "aminahassan", avatar: "", bio: "Dividend Investor | KCB Focus" },
];

export function TrendingSidebar() {
  const navigate = useNavigate();

  const { quotes } = useLiveQuotes(TRENDING_SYMBOLS);
  const trendingStocks = useMemo(
    () =>
      TRENDING_SYMBOLS.map((symbol) => {
        const q = quotes[symbol];
        return {
          symbol,
          name: getStockName(symbol),
          price: q?.lastPrice ?? null,
          change: q?.changePercent ?? null,
        };
      }),
    [quotes]
  );

  return (
    <div className="space-y-4">
      {/* Trending Stocks */}
      <div className="rounded-2xl bg-muted/30 border border-border p-4">
        <h3 className="font-bold text-lg mb-3">NSE Movers</h3>
        <div className="space-y-3">
          {trendingStocks.map(stock => (
            <div
              key={stock.symbol}
              className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              onClick={() => navigate(`/stock/${stock.symbol}`)}
            >
              <div>
                <div className="font-semibold text-sm">${stock.symbol}</div>
                <div className="text-xs text-muted-foreground">{stock.name}</div>
              </div>
              <div className="text-right">
                {stock.price != null && stock.change != null ? (
                  <>
                    <div className="text-sm font-medium">KES {stock.price.toFixed(2)}</div>
                    <div className={`text-xs font-medium flex items-center gap-0.5 justify-end ${stock.change >= 0 ? "text-bull" : "text-bear"}`}>
                      {stock.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(1)}%
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-2 text-primary text-sm h-9" onClick={() => navigate("/markets")}>
          Show more
        </Button>
      </div>

      {/* Trending Topics */}
      <div className="rounded-2xl bg-muted/30 border border-border p-4">
        <h3 className="font-bold text-lg mb-3">Trending</h3>
        <div className="space-y-3">
          {TRENDING_TOPICS.map(topic => (
            <div
              key={topic.tag}
              className="cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              onClick={() => navigate(`/traders-hub?search=${encodeURIComponent(topic.tag)}`)}
            >
              <div className="font-semibold text-sm">{topic.tag}</div>
              <div className="text-xs text-muted-foreground">{topic.posts} posts</div>
            </div>
          ))}
        </div>
      </div>

      {/* Who to follow */}
      <div className="rounded-2xl bg-muted/30 border border-border p-4">
        <h3 className="font-bold text-lg mb-3">Who to follow</h3>
        <div className="space-y-3">
          {SUGGESTED_USERS.map(u => (
            <div key={u.id} className="flex items-center gap-3">
              <Avatar className="h-10 w-10 cursor-pointer" onClick={() => navigate(`/profile/${u.id}`)}>
                <AvatarImage src={u.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {u.name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-sm truncate">{u.name}</span>
                  <Verified className="h-3 w-3 text-primary fill-primary shrink-0" />
                </div>
                <div className="text-xs text-muted-foreground truncate">@{u.handle}</div>
              </div>
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs font-bold shrink-0">
                Follow
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-2 text-primary text-sm h-9">
          Show more
        </Button>
      </div>
    </div>
  );
}