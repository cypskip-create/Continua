import { useMemo } from "react";
import { Heart, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Skeleton } from "@/components/ui/skeleton";

export function WatchlistSummary() {
  const navigate = useNavigate();
  const { watchlist, defaultFolderId, folders } = useWatchlist();

  const currentFolderId = defaultFolderId || folders[0]?.id;
  const folderItems = useMemo(
    () => watchlist.filter((item) => item.folder_id === currentFolderId),
    [watchlist, currentFolderId]
  );

  const symbols = useMemo(() => folderItems.map((item) => item.symbol), [folderItems]);
  const { quotes } = useLiveQuotes(symbols);

  const rows = useMemo(
    () =>
      folderItems.map((item) => {
        const quote = quotes[item.symbol.toUpperCase()];
        // No fallback: null price/change render a skeleton, never a
        // fabricated number.
        return {
          symbol: item.symbol,
          price: quote?.lastPrice ?? null,
          change: quote?.changePercent ?? null,
          isUp: (quote?.changePercent ?? 0) >= 0,
          isLive: !!quote,
        };
      }),
    [folderItems, quotes]
  );

  // Aggregate "today" move across the watchlist itself — averaged only over
  // rows with a real live quote, so it can't be dragged toward 0 by rows
  // still loading.
  const liveRows = rows.filter((r) => r.isLive);
  const avgChangePct = liveRows.length ? liveRows.reduce((s, r) => s + r.change!, 0) / liveRows.length : null;

  return (
    <Card className="card-gradient">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Heart className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">My Watchlist</CardTitle>
          </div>
          <button 
            onClick={() => navigate('/watchlist')}
            className="text-xs text-primary hover:text-primary/80"
          >
            View All
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Your watchlist is empty</p>
            <button onClick={() => navigate('/watchlist')} className="text-xs text-primary hover:underline mt-1">
              Add a stock to watch
            </button>
          </div>
        ) : (
          <>
            <div className="text-center p-3 rounded-lg bg-primary/10 border border-primary/20">
              {avgChangePct != null ? (
                <>
                  <div className="flex items-center justify-center space-x-1 text-primary mb-1">
                    {avgChangePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span className="text-sm font-medium">Watchlist avg. today</span>
                  </div>
                  <div className={`text-lg font-bold ${avgChangePct >= 0 ? "text-bull" : "text-bear"}`}>
                    {avgChangePct >= 0 ? "+" : ""}{avgChangePct.toFixed(2)}%
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-sm font-medium text-muted-foreground">Watchlist avg. today</span>
                  <Skeleton className="h-6 w-20" />
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {rows.slice(0, 3).map((stock) => (
                <div 
                  key={stock.symbol}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium">{stock.symbol}</span>
                  {stock.isLive ? (
                    <div className="text-right">
                      <div className="text-xs font-medium">KES {stock.price!.toFixed(2)}</div>
                      <div className={`text-xs ${stock.isUp ? 'text-bull' : 'text-bear'}`}>
                        {stock.isUp ? '+' : ''}{stock.change!.toFixed(2)}%
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <Skeleton className="h-3.5 w-12" />
                      <Skeleton className="h-3 w-9" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}