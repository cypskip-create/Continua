import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { getThemeBySlug } from "@/data/investmentThemes";
import { getStockName, getStockSector } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useSparklines } from "@/hooks/useSparklines";
import { PriceCell } from "@/components/shared/PriceCell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ThemeDetail() {
  const navigate = useNavigate();
  const { themeId } = useParams();
  const theme = getThemeBySlug(themeId || "");

  const { quotes } = useLiveQuotes(theme?.stocks ?? []);
  const { getSparkline } = useSparklines(theme?.stocks ?? []);
  const stocks = useMemo(() => {
    if (!theme) return [];
    return theme.stocks.map(symbol => {
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
  }, [theme, quotes]);

  const liveStocks = stocks.filter(s => s.isLive);
  const avgChange = liveStocks.length > 0 ? liveStocks.reduce((sum, s) => sum + s.change!, 0) / liveStocks.length : null;
  const isUp = (avgChange ?? 0) >= 0;

  if (!theme) {
    return (
      <div className="page-canvas min-h-screen bg-background pb-24 px-4 pt-16 text-center">
        <p className="text-sm font-semibold mb-2">Theme not found</p>
        <p className="text-xs text-muted-foreground mb-4">This investment theme doesn't exist or may have been renamed.</p>
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
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{theme.icon}</span>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">{theme.title}</h1>
              <p className="text-[11px] text-muted-foreground truncate">Investment Theme</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">
        {/* Hero */}
        <Card className="soft-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold">{theme.desc}</p>
            {avgChange != null ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isUp ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                {isUp ? '+' : ''}{avgChange.toFixed(1)}%
              </span>
            ) : (
              <Skeleton className="h-5 w-12 rounded-full shrink-0" />
            )}
          </div>
          <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground leading-snug">
            <Lightbulb className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
            <p>{theme.why}</p>
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {theme.stocks.map(s => (
              <Badge key={s} variant="secondary" className="text-[10px] py-0 px-1.5 border-0">{s}</Badge>
            ))}
          </div>
        </Card>

        {/* Member stocks */}
        <div>
          <h2 className="text-sm font-bold mb-3">In this theme ({stocks.length})</h2>
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
                  <PriceCell price={stock.price} changePercent={stock.change} isLive={stock.isLive} className="min-w-[72px]" />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}