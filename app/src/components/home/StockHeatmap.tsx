import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown } from "lucide-react";
import { CANONICAL_SYMBOLS, STOCK_META } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Skeleton } from "@/components/ui/skeleton";

interface HeatmapStock {
  symbol: string;
  name: string;
  change: number;
  marketCap: number;
  sector: string;
}

interface StockHeatmapProps {
  stocks?: HeatmapStock[];
}

// Just the reference universe (name/sector) + which dozen large-cap symbols
// to feature — change% and market cap (used only for relative tile sizing,
// never displayed as text) come from live quotes inside the component. A
// symbol with no live quote yet is excluded from the grid rather than
// tiled with a fabricated change.
const DEFAULT_HEATMAP_SYMBOLS = CANONICAL_SYMBOLS.slice(0, 20); // widened pool so 12 tiles can still fill in once quotes arrive

export function StockHeatmap({ stocks }: StockHeatmapProps) {
  const navigate = useNavigate();

  const { quotes } = useLiveQuotes(stocks ? [] : DEFAULT_HEATMAP_SYMBOLS);
  const liveDefaults: HeatmapStock[] = DEFAULT_HEATMAP_SYMBOLS
    .map(symbol => {
      const q = quotes[symbol];
      if (!q) return null;
      return {
        symbol,
        name: STOCK_META[symbol].name,
        change: +q.changePercent.toFixed(1),
        marketCap: (q.marketCap ?? 0) / 1e9, // billions, for relative tile sizing only
        sector: STOCK_META[symbol].sector,
      };
    })
    .filter((s): s is HeatmapStock => s !== null)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 12);

  const stockData = stocks || liveDefaults;
  const isLoadingDefaults = !stocks && stockData.length === 0;
  // Calculate total market cap for sizing
  const totalMarketCap = stockData.reduce((sum, s) => sum + s.marketCap, 0);

  const getHeatmapColor = (change: number) => {
    if (change > 3) return 'from-bull/90 to-bull/70';
    if (change > 1.5) return 'from-bull/70 to-bull/50';
    if (change > 0) return 'from-bull/50 to-bull/30';
    if (change > -1.5) return 'from-bear/30 to-bear/50';
    if (change > -3) return 'from-bear/50 to-bear/70';
    return 'from-bear/70 to-bear/90';
  };

  const getTextColor = (change: number) => {
    return Math.abs(change) > 1.5 ? 'text-white' : change >= 0 ? 'text-bull' : 'text-bear';
  };

  // Create a treemap-style layout
  const sortedStocks = [...stockData].sort((a, b) => b.marketCap - a.marketCap);

  if (isLoadingDefaults) {
    return (
      <div className="grid grid-cols-4 gap-1.5 auto-rows-fr">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className={`rounded-lg ${i < 3 ? 'col-span-2 row-span-2 min-h-[100px]' : i < 6 ? 'col-span-1 row-span-2 min-h-[80px]' : 'min-h-[60px]'}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-1.5 auto-rows-fr">
      {sortedStocks.map((stock, index) => {
        // Larger stocks get more visual prominence
        const isLarge = index < 3;
        const isMedium = index >= 3 && index < 6;
        
        return (
          <div
            key={stock.symbol}
            onClick={() => navigate(`/stock/${stock.symbol}`)}
            className={`
              relative overflow-hidden rounded-lg cursor-pointer
              transition-all duration-300 hover:scale-[1.02] hover:z-10 hover:shadow-lg
              bg-gradient-to-br ${getHeatmapColor(stock.change)}
              ${isLarge ? 'col-span-2 row-span-2 min-h-[100px]' : isMedium ? 'col-span-1 row-span-2 min-h-[80px]' : 'min-h-[60px]'}
              active:scale-[0.98]
            `}
          >
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 opacity-10" 
              style={{ 
                backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
                backgroundSize: '12px 12px'
              }} 
            />
            
            <div className="relative h-full p-2 flex flex-col justify-between">
              <div>
                <div className={`font-bold ${isLarge ? 'text-sm' : 'text-xs'} ${getTextColor(stock.change)}`}>
                  {stock.symbol}
                </div>
                {(isLarge || isMedium) && (
                  <div className={`text-[10px] opacity-80 ${Math.abs(stock.change) > 1.5 ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {stock.name}
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <span className={`font-bold ${isLarge ? 'text-base' : 'text-xs'} ${getTextColor(stock.change)}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(1)}%
                </span>
                {isLarge && (
                  stock.change >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-white/80" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-white/80" />
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}