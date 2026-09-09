import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Flame, Eye, ArrowUpRight, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { getStockName } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useSparklines } from "@/hooks/useSparklines";
import { Skeleton } from "@/components/ui/skeleton";

// Only the editorial part — which stocks are "trending" and why — is
// curated here. Price, change, and sparkline all come from live quotes /
// real candle history at render time, never hardcoded.
const TRENDING_PICKS: { symbol: string; reason: string; mentions: number }[] = [
  { symbol: "SCOM", reason: "M-Pesa expansion news", mentions: 1250 },
  { symbol: "EQTY", reason: "Strong Q4 earnings", mentions: 890 },
  { symbol: "KCB", reason: "Regional expansion", mentions: 654 },
  { symbol: "PORT", reason: "Infrastructure deals", mentions: 432 },
];

interface TrendingStock {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  volume: number | null;
  mentions: number;
  sparkline: number[] | undefined;
  reason: string;
  isLive: boolean;
}

export function TrendingStocks() {
  const navigate = useNavigate();
  const symbols = TRENDING_PICKS.map((p) => p.symbol);
  const { quotes } = useLiveQuotes(symbols);
  const { getSparkline } = useSparklines(symbols);

  const stocks: TrendingStock[] = useMemo(
    () =>
      TRENDING_PICKS.map((pick) => {
        const q = quotes[pick.symbol];
        return {
          symbol: pick.symbol,
          name: getStockName(pick.symbol),
          price: q?.lastPrice ?? null,
          change: q?.changePercent ?? null,
          volume: q?.volume ?? null,
          mentions: pick.mentions,
          sparkline: getSparkline(pick.symbol),
          reason: pick.reason,
          isLive: !!q,
        };
      }),
    [quotes, getSparkline]
  );

  return (
    <Card className="card-gradient">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Trending Now
          </CardTitle>
          <Badge variant="secondary" className="text-xs gap-1">
            <Zap className="h-3 w-3" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stocks.map((stock, index) => (
          <div
            key={stock.symbol}
            onClick={() => navigate(`/stock/${stock.symbol}`)}
            className="p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all cursor-pointer border border-transparent hover:border-primary/20 group"
          >
            <div className="flex items-center gap-3">
              {/* Rank */}
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>

              {/* Stock Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{stock.symbol}</span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground truncate">{stock.name}</p>
              </div>

              {/* Sparkline */}
              <div className="w-16 h-8">
                <SparklineChart 
                  data={stock.sparkline} 
                  isPositive={stock.change >= 0}
                />
              </div>

              {/* Price & Change */}
              <div className="text-right">
                {stock.isLive ? (
                  <>
                    <p className="text-sm font-semibold">KES {stock.price!.toFixed(2)}</p>
                    <p className={`text-xs font-medium ${stock.change! >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {stock.change! >= 0 ? '+' : ''}{stock.change!.toFixed(2)}%
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                )}
              </div>
            </div>

            {/* Trending reason & stats */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-xs">
              <span className="text-muted-foreground truncate max-w-[60%]">
                {stock.reason}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {stock.mentions}
                </span>
                {stock.volume != null && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {stock.volume.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}