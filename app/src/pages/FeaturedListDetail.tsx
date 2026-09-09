import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Star, DollarSign, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { getFeaturedListBySlug } from "@/data/featuredLists";
import { getStockName, getStockSector } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useSparklines } from "@/hooks/useSparklines";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS: Record<string, typeof Star> = {
  "blue-chip-nse": Star,
  "high-dividend": DollarSign,
  "undervalued": Award,
};

export default function FeaturedListDetail() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const list = getFeaturedListBySlug(slug || "");
  const Icon = list ? (ICONS[list.slug] || Star) : Star;

  const { quotes } = useLiveQuotes(list?.symbols ?? []);
  const { getSparkline } = useSparklines(list?.symbols ?? []);
  const stocks = useMemo(() => {
    if (!list) return [];
    return list.symbols.map(symbol => {
      const q = quotes[symbol];
      return {
        symbol,
        name: getStockName(symbol),
        sector: getStockSector(symbol),
        price: q?.lastPrice ?? null,
        change: q?.changePercent ?? null,
        isLive: !!q,
      };
    });
  }, [list, quotes]);

  const liveStocks = stocks.filter(s => s.isLive);
  const avgChange = liveStocks.length > 0 ? liveStocks.reduce((sum, s) => sum + s.change!, 0) / liveStocks.length : null;
  const isUp = (avgChange ?? 0) >= 0;

  if (!list) {
    return (
      <div className="page-canvas min-h-screen bg-background pb-24 px-4 pt-16 text-center">
        <p className="text-sm font-semibold mb-2">List not found</p>
        <p className="text-xs text-muted-foreground mb-4">This featured list doesn't exist or may have been renamed.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/markets")}>Back to Markets</Button>
      </div>
    );
  }

  return (
    <div className="page-canvas min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9" data-small-target>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">{list.title}</h1>
            <p className="text-[11px] text-muted-foreground truncate">Featured List</p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">
        {/* Hero */}
        <Card className="soft-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-9 h-9 rounded-2xl ${list.color} flex items-center justify-center shrink-0`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-sm font-bold truncate">{list.desc}</p>
            </div>
            {avgChange != null ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isUp ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                {isUp ? '+' : ''}{avgChange.toFixed(1)}%
              </span>
            ) : (
              <Skeleton className="h-5 w-12 rounded-full shrink-0" />
            )}
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {list.symbols.map(s => (
              <Badge key={s} variant="secondary" className="text-[10px] py-0 px-1.5 border-0">{s}</Badge>
            ))}
          </div>
        </Card>

        {/* Member stocks */}
        <div>
          <h2 className="text-sm font-bold mb-3">In this list ({stocks.length})</h2>
          <Card className="soft-card overflow-hidden">
            {stocks.map(stock => (
              <div
                key={stock.symbol}
                onClick={() => navigate(`/stock/${stock.symbol}`)}
                className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {stock.symbol.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{stock.symbol}</p>
                    <p className="text-xs text-muted-foreground truncate">{stock.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <SparklineChart isPositive={(stock.change ?? 0) >= 0} width={44} height={18} data={getSparkline(stock.symbol)} isLoading={!stock.isLive} />
                  {stock.isLive ? (
                    <div className="text-right min-w-[72px]">
                      <p className="text-sm font-bold">KES {stock.price!.toFixed(2)}</p>
                      <p className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${stock.change! >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {stock.change! >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {stock.change! >= 0 ? '+' : ''}{stock.change!.toFixed(1)}%
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-[72px] flex flex-col items-end gap-1">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}