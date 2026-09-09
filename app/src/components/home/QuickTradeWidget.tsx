import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { getStockName } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useSparklines } from "@/hooks/useSparklines";
import { Skeleton } from "@/components/ui/skeleton";

// Just the symbols to feature here — price, day-change, and sparkline come
// from live quotes / real candle history only. No fallback to a fabricated
// number: an unloaded symbol shows a loading skeleton in the marquee.
const QUICK_SYMBOLS = ["SCOM", "EQTY", "KCB", "SCBK", "EABL", "COOP", "ABSA", "NCBA", "PORT", "BRIT", "KPLC"];

export function QuickTradeWidget() {
  const navigate = useNavigate();
  const { quotes } = useLiveQuotes(QUICK_SYMBOLS);
  const { getSparkline } = useSparklines(QUICK_SYMBOLS);

  const stocks = QUICK_SYMBOLS.map((symbol) => {
    const q = quotes[symbol];
    return {
      symbol,
      name: getStockName(symbol),
      price: q?.lastPrice ?? null,
      changePct: q?.changePercent ?? null,
      sparkline: getSparkline(symbol),
      isLive: !!q,
    };
  });
  const loop = [...stocks, ...stocks];

  return (
    <Card className="card-gradient overflow-hidden">
      <div className="relative">
        <CardContent className="p-0 relative">
          <div className="marquee-container -mx-0">
            <div className="marquee-content gap-2">
              {loop.map((stock, i) => (
                <button
                  key={`${stock.symbol}-${i}`}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  className="shrink-0 w-[140px] p-3 rounded-xl bg-muted/50 hover:bg-muted text-left transition-all active:scale-[0.97] tap-scale"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold">${stock.symbol}</p>
                    <SparklineChart isPositive={(stock.changePct ?? 0) >= 0} width={32} height={14} data={stock.sparkline} isLoading={!stock.isLive} />
                  </div>
                  {stock.isLive ? (
                    <>
                      <p className="text-sm font-bold tabular-nums">KES {stock.price!.toFixed(2)}</p>
                      <p className={`text-[10px] font-semibold flex items-center gap-0.5 ${stock.changePct! >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {stock.changePct! >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {stock.changePct! >= 0 ? '+' : ''}{stock.changePct!.toFixed(2)}%
                      </p>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}