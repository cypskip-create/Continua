import { ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useMovers } from "@/hooks/useMovers";
import { STOCK_META } from "@/lib/stockPrices";
import { Skeleton } from "@/components/ui/skeleton";

interface MoverRow { symbol: string; name: string; price: number; change: number; isUp: boolean; }

export function TopMoversLosers() {
  const navigate = useNavigate();
  const { gainers: liveGainers, losers: liveLosers, isLoading } = useMovers();

  const toRow = (q: { symbol: string; lastPrice: number; changePercent: number }): MoverRow => ({
    symbol: q.symbol, name: STOCK_META[q.symbol]?.name ?? q.symbol,
    price: q.lastPrice, change: q.changePercent, isUp: q.changePercent >= 0,
  });
  const gainers = liveGainers.slice(0, 5).map(toRow);
  const losers = liveLosers.slice(0, 5).map(toRow);

  const StockList = ({ stocks }: { stocks: MoverRow[] }) => {
    if (isLoading && stocks.length === 0) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
              <div className="space-y-1.5"><Skeleton className="h-4 w-24" /><Skeleton className="h-3.5 w-16" /></div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      );
    }
    if (stocks.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-6">No movers data yet</p>;
    }
    return (
      <div className="space-y-3">
        {stocks.map((stock) => (
          <div
            key={stock.symbol}
            onClick={() => navigate(`/stock/${stock.symbol}`)}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-foreground">{stock.symbol}</span>
                <span className="text-xs text-muted-foreground">{stock.name}</span>
              </div>
              <div className="text-sm font-medium">KES {stock.price.toFixed(2)}</div>
            </div>

            <div className={`flex items-center space-x-1 ${stock.isUp ? 'text-bull' : 'text-bear'}`}>
              {stock.isUp ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
              <span className="font-medium text-sm">
                {stock.isUp ? '+' : ''}{stock.change}%
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="card-gradient">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Market Movers</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="movers" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="movers" className="text-xs sm:text-sm">
              <ArrowUp className="h-3 w-3 mr-1" />
              Top Gainers
            </TabsTrigger>
            <TabsTrigger value="losers" className="text-xs sm:text-sm">
              <ArrowDown className="h-3 w-3 mr-1" />
              Top Losers
            </TabsTrigger>
          </TabsList>
          <TabsContent value="movers">
            <StockList stocks={gainers} />
          </TabsContent>
          <TabsContent value="losers">
            <StockList stocks={losers} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}