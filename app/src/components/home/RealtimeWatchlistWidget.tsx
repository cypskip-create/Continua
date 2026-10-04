import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, TrendingUp, TrendingDown, ChevronRight, Eye, Sparkles } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useRealtimePrices } from "@/hooks/useRealtimePrices";
import { SparklineChart } from "@/components/shared/SparklineChart";

export function RealtimeWatchlistWidget() {
  const navigate = useNavigate();
  const { watchlist, loading } = useWatchlist();
  
  const symbols = watchlist.map(item => item.symbol);
  const { prices } = useRealtimePrices(symbols);

  if (loading) {
    return (
      <Card className="card-gradient">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/30 border-t-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (watchlist.length === 0) {
    return (
      <Card className="card-gradient overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <span>Your Watchlist</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="text-center py-6">
            <Heart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mb-3">No stocks in watchlist</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/markets')}
              className="text-xs"
            >
              Browse Stocks
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-gradient overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent animate-pulse" />
            <span>Live Watchlist</span>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/watchlist')}
            className="text-xs h-7 px-2"
          >
            View All
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div className="space-y-1">
          {watchlist.slice(0, 5).map((item) => {
            const priceData = prices[item.symbol];
            const isUp = priceData ? priceData.change >= 0 : true;
            
            return (
              <div
                key={item.id}
                onClick={() => navigate(`/stock/${item.symbol}`)}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/30 cursor-pointer transition-all tap-scale group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {item.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{item.symbol}</div>
                    <div className="text-[0.625rem] text-muted-foreground truncate">{item.name}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <SparklineChart isPositive={isUp} width={35} height={16} />
                  <div className="text-right min-w-[70px]">
                    <div className="font-semibold text-sm">
                      KES {priceData?.price.toFixed(2) || '---'}
                    </div>
                    <div className={`text-[0.625rem] flex items-center justify-end gap-0.5 ${isUp ? 'text-bull' : 'text-bear'}`}>
                      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {priceData ? `${isUp ? '+' : ''}${priceData.changePercent.toFixed(2)}%` : '---'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
