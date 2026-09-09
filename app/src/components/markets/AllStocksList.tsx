import { useState, useMemo, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, TrendingDown, Filter, ChevronDown, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SparklineChart } from "@/components/shared/SparklineChart";
import { CANONICAL_SYMBOLS, STOCK_META } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useSparklines } from "@/hooks/useSparklines";
import { Skeleton } from "@/components/ui/skeleton";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useToast } from "@/hooks/use-toast";
import { AddToWatchlistDialog } from "@/components/markets/AddToWatchlistDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Canonical symbols only, so a company with two ticker aliases — e.g.
// Diamond Trust Bank, Stanbic — never appears twice.
const sectors = ["All Sectors", ...Array.from(new Set(CANONICAL_SYMBOLS.map(s => STOCK_META[s].sector))).sort()];

interface AllStocksListProps {
  /** Pre-applied sector filter, e.g. from tapping a sector card elsewhere on Markets. */
  initialSector?: string;
  /** Restrict the list to just these symbols, e.g. for a "Featured list" drill-down. */
  onlySymbols?: string[];
}

export function AllStocksList({ initialSector, onlySymbols }: AllStocksListProps = {}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState(initialSector || "All Sectors");
  const [sortBy, setSortBy] = useState<"name" | "change" | "price">("name");
  const { isInWatchlist, addToWatchlist, removeFromWatchlist, folders, foldersLoading } = useWatchlist();
  const { toast } = useToast();
  const [pickerStock, setPickerStock] = useState<{ symbol: string; name: string } | null>(null);

  useEffect(() => { if (initialSector) setSelectedSector(initialSector); }, [initialSector]);

  // Live Continua Data Layer quotes — a symbol the Data Layer's current NSE
  // universe doesn't have yet (see docs/api/API.md / instruments endpoint)
  // shows a loading skeleton in the list rather than a fabricated price.
  const { quotes } = useLiveQuotes(CANONICAL_SYMBOLS);
  const { getSparkline } = useSparklines(CANONICAL_SYMBOLS);

  const allStocks = useMemo(
    () => CANONICAL_SYMBOLS.map(symbol => {
      const quote = quotes[symbol];
      return {
        symbol,
        name: STOCK_META[symbol].name,
        sector: STOCK_META[symbol].sector,
        price: quote?.lastPrice ?? null,
        change: quote?.changePercent ?? null,
        isUp: (quote?.change ?? 0) >= 0,
        isLive: !!quote,
      };
    }),
    [quotes]
  );

  const baseStocks = useMemo(
    () => onlySymbols ? allStocks.filter(s => onlySymbols.includes(s.symbol)) : allStocks,
    [onlySymbols, allStocks]
  );

  const filteredStocks = useMemo(() => {
    let stocks = baseStocks.filter(stock => {
      const matchesSearch = stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           stock.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSector = selectedSector === "All Sectors" || stock.sector === selectedSector;
      return matchesSearch && matchesSector;
    });

    return stocks.sort((a, b) => {
      switch(sortBy) {
        case "change":
          return (b.change ?? -Infinity) - (a.change ?? -Infinity);
        case "price":
          return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        default:
          return a.symbol.localeCompare(b.symbol);
      }
    });
  }, [baseStocks, searchQuery, selectedSector, sortBy]);

  // Infinite scroll: reveal 20 more each time sentinel enters view
  const PAGE = 20;
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setVisible(PAGE); }, [searchQuery, selectedSector, sortBy]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisible(v => Math.min(filteredStocks.length, v + PAGE));
      }
    }, { rootMargin: "300px" });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [filteredStocks.length]);

  const toggleFavorite = async (symbol: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Only one watchlist exists (the common free-tier case) — just toggle it,
    // no need to make the person pick from a list of one.
    if (!foldersLoading && folders.length <= 1) {
      if (isInWatchlist(symbol)) {
        await removeFromWatchlist(symbol);
        toast({ title: "Removed from watchlist" });
      } else {
        const { error } = await addToWatchlist(symbol, name) || {};
        if (!error) toast({ title: "Added to watchlist" });
      }
      return;
    }
    // Multiple named watchlists (Premium) — let them choose which one(s).
    setPickerStock({ symbol, name });
  };

  return (
    <>
    <Card className="soft-card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="text-sm font-bold">All Stocks ({filteredStocks.length})</span>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-full">
                <Filter className="h-3 w-3 mr-1" />
                {selectedSector === "All Sectors" ? "Sector" : selectedSector}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {sectors.map(sector => (
                <DropdownMenuItem key={sector} onClick={() => setSelectedSector(sector)}>
                  {sector}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs rounded-full">
                Sort
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy("name")}>Name A-Z</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("change")}>Top Gainers</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("price")}>Highest Price</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search */}
      <div className="relative px-4 pb-3">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search stocks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-full h-9"
        />
      </div>

      {/* Stocks List — same flat, bordered-row style as the Watchlist page, plus the
          sector filter/sort/search/star-to-watchlist features All Stocks needs on top. */}
      <div>
        {filteredStocks.slice(0, visible).map((stock) => (
          <div
            key={stock.symbol}
            onClick={() => navigate(`/stock/${stock.symbol}`)}
            data-small-target
            className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 cursor-pointer active:bg-muted/30 transition-colors"
          >
            <button
              onClick={(e) => toggleFavorite(stock.symbol, stock.name, e)}
              className="shrink-0 -ml-1 p-1"
              aria-label="Toggle watchlist"
            >
              <Heart className={`h-4 w-4 ${isInWatchlist(stock.symbol) ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold leading-tight">{stock.symbol}</p>
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{stock.name} · {stock.sector}</p>
            </div>

            <SparklineChart isPositive={stock.isUp} width={48} height={20} data={getSparkline(stock.symbol)} isLoading={!stock.isLive} />

            <div className="text-right shrink-0 w-[84px]">
              {stock.isLive ? (
                <>
                  <p className="text-[13.5px] font-bold tabular-nums leading-tight">KES {stock.price!.toFixed(2)}</p>
                  <div className={`flex items-center justify-end gap-0.5 mt-0.5 ${stock.isUp ? 'text-bull' : 'text-bear'}`}>
                    {stock.isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span className="text-[11px] font-semibold tabular-nums">{stock.isUp ? '+' : ''}{stock.change!.toFixed(2)}%</span>
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
        {filteredStocks.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No stocks match this filter</p>
        )}
        {visible < filteredStocks.length && (
          <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
            Loading more…
          </div>
        )}
      </div>
    </Card>

    {pickerStock && (
      <AddToWatchlistDialog
        open={!!pickerStock}
        onOpenChange={(o) => !o && setPickerStock(null)}
        symbol={pickerStock.symbol}
        name={pickerStock.name}
      />
    )}
    </>
  );
}