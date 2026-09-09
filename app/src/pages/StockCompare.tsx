import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, GitCompare, Plus, X, TrendingUp, TrendingDown, Search, BarChart3, PieChart, Activity, DollarSign, Percent, Scale, ChevronRight } from "lucide-react";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CANONICAL_SYMBOLS, STOCK_META, DIV_YIELD, getStockFundamentals, tickerSeed } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useSparklines } from "@/hooks/useSparklines";

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: string;
  pe: number;
  eps: number;
  dividendYield: number;
  roe: number;
  debtToEquity: number;
  beta: number;
  high52: number;
  low52: number;
  volume: string;
  sector: string;
}

// Formats a raw KES figure as "692.9B" / "8.1M" for market cap and volume
// display — the inverse of stockPrices.ts's old parseMagnitude, now local
// since it's only needed here for real (live-quote) numbers.
function formatMagnitude(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Inverse of the above, for comparing magnitude-formatted strings ("692.9B" vs "8.1M").
function parseMagnitude(s: string): number {
  const m = s.match(/^([\d.]+)([KMBT]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2].toUpperCase()] ?? 1;
  return n * mult;
}

// Real fields: price/change/marketCap/volume — live quotes only (see
// stocksDatabase below). P/E and beta are illustrative placeholders (no
// real source yet — see getStockFundamentals). ROE and debt/equity aren't
// tracked anywhere real either, so they're derived deterministically per
// symbol (stable across reloads, compare-only, clearly a placeholder).
function buildStaticStock(symbol: string, price: number): Omit<Stock, "symbol" | "name" | "sector" | "price" | "change" | "marketCap" | "volume"> {
  const seed = tickerSeed(symbol);
  const meta = getStockFundamentals(symbol);
  return {
    pe: meta.pe,
    eps: meta.pe > 0 ? +(price / meta.pe).toFixed(2) : 0,
    dividendYield: DIV_YIELD[symbol] ?? 0,
    roe: +(10 + (seed % 20)).toFixed(1),
    debtToEquity: +(0.3 + (seed % 70) / 100).toFixed(2),
    beta: meta.beta,
    high52: +(price * 1.12).toFixed(2),
    low52: +(price * 0.85).toFixed(2),
  };
}

const comparisonMetrics = [
  { key: "price", label: "Price", icon: DollarSign, format: (v: number) => `KES ${v.toFixed(2)}` },
  { key: "change", label: "Change %", icon: TrendingUp, format: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, colorize: true },
  { key: "marketCap", label: "Market Cap", icon: BarChart3, format: (v: string) => v },
  { key: "pe", label: "P/E Ratio", icon: Scale, format: (v: number) => v.toFixed(1) },
  { key: "eps", label: "EPS", icon: Activity, format: (v: number) => `KES ${v.toFixed(2)}` },
  { key: "dividendYield", label: "Dividend Yield", icon: Percent, format: (v: number) => `${v.toFixed(1)}%` },
  { key: "roe", label: "ROE", icon: PieChart, format: (v: number) => `${v.toFixed(1)}%` },
  { key: "debtToEquity", label: "Debt/Equity", icon: Scale, format: (v: number) => v.toFixed(2) },
  { key: "beta", label: "Beta", icon: Activity, format: (v: number) => v.toFixed(2) },
  { key: "high52", label: "52W High", icon: TrendingUp, format: (v: number) => `KES ${v.toFixed(2)}` },
  { key: "low52", label: "52W Low", icon: TrendingDown, format: (v: number) => `KES ${v.toFixed(2)}` },
  { key: "volume", label: "Volume", icon: BarChart3, format: (v: string) => v },
];

export default function StockCompare() {
  const navigate = useNavigate();
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Live Continua Data Layer quotes — the ONLY source for price/change/
  // marketCap/volume. A symbol with no live quote yet is excluded from
  // stocksDatabase entirely (so it can't be searched/added while unpriced,
  // and the comparison table never has to show a fabricated cell).
  const { quotes } = useLiveQuotes(CANONICAL_SYMBOLS);
  const stocksDatabase = useMemo(() => {
    return CANONICAL_SYMBOLS
      .map(symbol => {
        const q = quotes[symbol];
        if (!q) return null;
        const price = q.lastPrice;
        return {
          symbol,
          name: STOCK_META[symbol].name,
          sector: STOCK_META[symbol].sector,
          price,
          change: +q.changePercent.toFixed(2),
          marketCap: q.marketCap != null ? formatMagnitude(q.marketCap) : "—",
          volume: formatMagnitude(q.volume),
          ...buildStaticStock(symbol, price),
        } satisfies Stock;
      })
      .filter((s): s is Stock => s !== null);
  }, [quotes]);

  const selectedStocks = useMemo(
    () => selectedSymbols.map(sym => stocksDatabase.find(s => s.symbol === sym)).filter((s): s is Stock => !!s),
    [selectedSymbols, stocksDatabase]
  );

  const { getSparkline } = useSparklines(selectedSymbols);

  const filteredStocks = stocksDatabase.filter(
    stock =>
      !selectedSymbols.includes(stock.symbol) &&
      (stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const addStock = (stock: Stock) => {
    if (selectedSymbols.length < 4) {
      setSelectedSymbols(prev => [...prev, stock.symbol]);
      setSearchQuery("");
      setShowSearch(false);
    }
  };

  const removeStock = (symbol: string) => {
    setSelectedSymbols(prev => prev.filter(s => s !== symbol));
  };

  const getBestValue = (key: string, isHigherBetter: boolean = true) => {
    if (selectedStocks.length < 2) return null;
    const values = selectedStocks.map(s => {
      const val = s[key as keyof Stock];
      return typeof val === 'number' ? val : parseMagnitude(String(val));
    });
    const bestIdx = isHigherBetter
      ? values.indexOf(Math.max(...values))
      : values.indexOf(Math.min(...values));
    return selectedStocks[bestIdx]?.symbol;
  };

  return (
    <div className="page-canvas min-h-screen bg-background pb-20">
      {/* Header — thin, editorial */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="tap-scale h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-base font-semibold flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Compare
              </h1>
              <p className="text-[10px] text-muted-foreground">Side-by-side analysis</p>
            </div>
          </div>
          {selectedStocks.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedSymbols([])} className="text-xs text-muted-foreground">
              Clear
            </Button>
          )}
        </div>
      </header>

      <div className="px-4 pt-6 space-y-8">
        {/* Add stock — canvas, no card */}
        {selectedStocks.length < 4 && (
          <div>
            {showSearch ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search stocks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
                <div className="border-t border-border/60 max-h-64 overflow-y-auto">
                  {filteredStocks.slice(0, 8).map((stock) => (
                    <button
                      key={stock.symbol}
                      onClick={() => addStock(stock)}
                      className="w-full flex items-center justify-between py-2.5 border-b border-border/40 hover:bg-muted/30 -mx-4 px-4 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center text-[10px] font-bold text-primary">
                          {stock.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{stock.symbol}</div>
                          <div className="text-[10px] text-muted-foreground">{stock.name}</div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSearch(false)} className="w-full">
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="w-full h-12 rounded-full border border-dashed border-border/70 hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Stock to Compare ({selectedStocks.length}/4)
              </button>
            )}
          </div>
        )}

        {/* Selected chips — no card, hairline rail */}
        {selectedStocks.length > 0 && (
          <ScrollArea className="w-full -mx-4">
            <div className="flex gap-4 px-4 pb-2">
              {selectedStocks.map((stock) => (
                <div key={stock.symbol} className="min-w-[150px] flex-shrink-0 border-t border-border/60 pt-3 relative">
                  <button
                    className="absolute -top-1 right-0 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => removeStock(stock.symbol)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center text-[10px] font-bold text-primary">
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{stock.symbol}</div>
                      <div className="text-[9px] text-muted-foreground">{stock.sector}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular">KES {stock.price.toFixed(2)}</div>
                  <div className={`text-[11px] flex items-center gap-0.5 tabular ${stock.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {stock.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {stock.change >= 0 ? '+' : ''}{stock.change}%
                  </div>
                  <div className="mt-2">
                    <SparklineChart isPositive={stock.change >= 0} width={130} height={26} data={getSparkline(stock.symbol)} />
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Comparison table — flat */}
        {selectedStocks.length >= 2 && (
          <div>
            <p className="section-eyebrow mb-2 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-accent" /> Detailed Comparison
            </p>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-y border-border/60">
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground sticky left-0 bg-background">Metric</th>
                    {selectedStocks.map((stock) => (
                      <th key={stock.symbol} className="text-center py-2 px-3 font-semibold min-w-[90px]">
                        {stock.symbol}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonMetrics.map((metric) => {
                    const Icon = metric.icon;
                    const isHigherBetter = !['pe', 'debtToEquity', 'beta'].includes(metric.key);
                    const bestSymbol = getBestValue(metric.key, isHigherBetter);

                    return (
                      <tr key={metric.key} className="border-b border-border/40">
                        <td className="py-2.5 px-4 font-medium sticky left-0 bg-background">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {metric.label}
                          </div>
                        </td>
                        {selectedStocks.map((stock) => {
                          const value = stock[metric.key as keyof Stock];
                          const isBest = bestSymbol === stock.symbol;
                          const numValue = typeof value === 'number' ? value : 0;
                          const colorClass = metric.colorize && typeof value === 'number'
                            ? numValue >= 0 ? 'text-bull' : 'text-bear'
                            : '';

                          return (
                            <td
                              key={stock.symbol}
                              className={`text-center py-2.5 px-3 tabular ${isBest ? 'font-bold text-primary' : ''} ${colorClass}`}
                            >
                              {typeof value === 'number'
                                ? (metric.format as (v: number) => string)(value)
                                : (metric.format as (v: string) => string)(value as string)}
                              {isBest && <span className="ml-1">★</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {selectedStocks.length === 0 && (
          <div className="text-center py-14">
            <GitCompare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="font-semibold mb-2">Compare Stocks</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">
              Add 2–4 stocks to compare performance, valuation and key metrics side-by-side.
            </p>
            <Button onClick={() => setShowSearch(true)} className="btn-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add First Stock
            </Button>
          </div>
        )}

        {selectedStocks.length === 1 && (
          <div className="border-t border-b border-primary/25 bg-primary/5 -mx-4 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">Add at least one more stock to start comparing</p>
          </div>
        )}
      </div>
    </div>
  );
}