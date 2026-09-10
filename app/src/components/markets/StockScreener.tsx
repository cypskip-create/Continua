import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Filter, TrendingUp, TrendingDown, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
import { SparklineChart } from "@/components/shared/SparklineChart";

interface ScreenerFilters {
  sector: string;
  minChange: number;
  maxChange: number;
  minPrice: number;
  maxPrice: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const sectors = [
  "All Sectors",
  "Banking",
  "Telecommunications",
  "Manufacturing",
  "Energy",
  "Consumer Goods",
  "Insurance",
  "Real Estate",
  "Agriculture",
];

const allStocks = [
  { symbol: "SCOM", name: "Safaricom PLC", price: 12.85, change: 2.4, volume: "12.5M", marketCap: "1.2T", pe: 14.2, sector: "Telecommunications" },
  { symbol: "EQTY", name: "Equity Group Holdings", price: 62.50, change: 3.8, volume: "8.2M", marketCap: "285B", pe: 8.5, sector: "Banking" },
  { symbol: "SCBK", name: "Standard Chartered Bank", price: 185.00, change: 1.1, volume: "1.5M", marketCap: "125B", pe: 11.2, sector: "Banking" },
  { symbol: "KCB", name: "KCB Group PLC", price: 45.30, change: -0.8, volume: "6.8M", marketCap: "145B", pe: 7.8, sector: "Banking" },
  { symbol: "COOP", name: "Co-operative Bank", price: 15.20, change: -1.5, volume: "4.2M", marketCap: "89B", pe: 9.1, sector: "Banking" },
  { symbol: "EABL", name: "East African Breweries", price: 142.00, change: 2.1, volume: "850K", marketCap: "112B", pe: 18.5, sector: "Consumer Goods" },
  { symbol: "BAMB", name: "Bamburi Cement", price: 89.75, change: -2.8, volume: "320K", marketCap: "32B", pe: 12.3, sector: "Manufacturing" },
  { symbol: "DTB", name: "Diamond Trust Bank", price: 115.50, change: 0.5, volume: "180K", marketCap: "32B", pe: 10.4, sector: "Banking" },
  { symbol: "ABSA", name: "ABSA Bank Kenya", price: 13.85, change: 1.9, volume: "5.5M", marketCap: "75B", pe: 7.2, sector: "Banking" },
  { symbol: "NCBA", name: "NCBA Group", price: 42.50, change: 0.7, volume: "2.1M", marketCap: "68B", pe: 8.9, sector: "Banking" },
  { symbol: "BRIT", name: "Britam Holdings", price: 6.85, change: -1.2, volume: "1.8M", marketCap: "17B", pe: 15.6, sector: "Insurance" },
  { symbol: "NMG", name: "Nation Media Group", price: 25.40, change: -0.3, volume: "420K", marketCap: "4.8B", pe: 22.1, sector: "Consumer Goods" },
  { symbol: "KPLC", name: "Kenya Power", price: 1.95, change: 4.2, volume: "15.2M", marketCap: "3.8B", pe: 6.5, sector: "Energy" },
  { symbol: "TOTL", name: "TotalEnergies", price: 24.80, change: 1.5, volume: "280K", marketCap: "4.5B", pe: 13.2, sector: "Energy" },
  { symbol: "JUB", name: "Jubilee Holdings", price: 245.00, change: -0.9, volume: "45K", marketCap: "17B", pe: 11.8, sector: "Insurance" },
];

const presetFilters = [
  { name: "Top Gainers", filters: { sector: "All Sectors", minChange: 1, maxChange: 100, sortBy: "change", sortOrder: "desc" as const } },
  { name: "Top Losers", filters: { sector: "All Sectors", minChange: -100, maxChange: -0.1, sortBy: "change", sortOrder: "asc" as const } },
  { name: "High Volume", filters: { sector: "All Sectors", minChange: -100, maxChange: 100, sortBy: "volume", sortOrder: "desc" as const } },
  { name: "Banking", filters: { sector: "Banking", minChange: -100, maxChange: 100, sortBy: "marketCap", sortOrder: "desc" as const } },
];

export function StockScreener() {
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ScreenerFilters>({
    sector: "All Sectors",
    minChange: -10,
    maxChange: 10,
    minPrice: 0,
    maxPrice: 500,
    sortBy: "marketCap",
    sortOrder: "desc",
  });

  const applyPreset = (preset: typeof presetFilters[0]) => {
    setFilters(prev => ({ ...prev, ...preset.filters }));
  };

  const resetFilters = () => {
    setFilters({
      sector: "All Sectors",
      minChange: -10,
      maxChange: 10,
      minPrice: 0,
      maxPrice: 500,
      sortBy: "marketCap",
      sortOrder: "desc",
    });
  };

  const filteredStocks = allStocks
    .filter(stock => {
      if (filters.sector !== "All Sectors" && stock.sector !== filters.sector) return false;
      if (stock.change < filters.minChange || stock.change > filters.maxChange) return false;
      if (stock.price < filters.minPrice || stock.price > filters.maxPrice) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = filters.sortBy === 'change' ? a.change : 
                   filters.sortBy === 'price' ? a.price : 
                   filters.sortBy === 'volume' ? parseFloat(a.volume) : parseFloat(a.marketCap);
      const bVal = filters.sortBy === 'change' ? b.change : 
                   filters.sortBy === 'price' ? b.price : 
                   filters.sortBy === 'volume' ? parseFloat(b.volume) : parseFloat(b.marketCap);
      return filters.sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

  return (
    <Card className="card-gradient">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span>Stock Screener</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs"
          >
            <Filter className="h-3.5 w-3.5 mr-1" />
            {showFilters ? 'Hide' : 'Filters'}
          </Button>
        </div>
        
        {/* Quick Presets */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {presetFilters.map((preset) => (
            <Badge
              key={preset.name}
              variant="secondary"
              className="cursor-pointer hover:bg-primary/20 transition-colors whitespace-nowrap text-xs py-1 px-2"
              onClick={() => applyPreset(preset)}
            >
              {preset.name}
            </Badge>
          ))}
        </div>
      </CardHeader>

      {showFilters && (
        <div className="px-4 pb-4 space-y-4 border-b border-border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Sector</label>
              <Select
                value={filters.sector}
                onValueChange={(val) => setFilters(prev => ({ ...prev, sector: val }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map(sector => (
                    <SelectItem key={sector} value={sector} className="text-xs">
                      {sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Sort By</label>
              <Select
                value={filters.sortBy}
                onValueChange={(val) => setFilters(prev => ({ ...prev, sortBy: val }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketCap" className="text-xs">Market Cap</SelectItem>
                  <SelectItem value="change" className="text-xs">% Change</SelectItem>
                  <SelectItem value="price" className="text-xs">Price</SelectItem>
                  <SelectItem value="volume" className="text-xs">Volume</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Change Range: {filters.minChange}% to {filters.maxChange}%
            </label>
            <div className="flex items-center gap-3">
              <Slider
                value={[filters.minChange, filters.maxChange]}
                min={-10}
                max={10}
                step={0.5}
                onValueChange={([min, max]) => setFilters(prev => ({ ...prev, minChange: min, maxChange: max }))}
                className="flex-1"
              />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Badge variant="outline" className="text-xs">
              {filteredStocks.length} stocks
            </Badge>
          </div>
        </div>
      )}

      <CardContent className="pt-3">
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredStocks.slice(0, 10).map((stock) => (
            <div
              key={stock.symbol}
              onClick={() => navigate(`/stock/${stock.symbol}`)}
              className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 cursor-pointer hover:bg-muted/40 transition-all tap-scale group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{stock.symbol}</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 hidden sm:inline-flex">
                    {stock.sector}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
                <div className="flex gap-3 mt-1">
                  <span className="text-[10px] text-muted-foreground">Vol: {stock.volume}</span>
                  <span className="text-[10px] text-muted-foreground">P/E: {stock.pe}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <SparklineChart isPositive={stock.change >= 0} width={40} height={18} />
                <div className="text-right min-w-[65px]">
                  <div className="font-semibold text-sm">KES {stock.price}</div>
                  <div className={`text-xs flex items-center justify-end gap-0.5 ${stock.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                    {stock.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {stock.change >= 0 ? '+' : ''}{stock.change}%
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
        
        {filteredStocks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No stocks match your filters
          </div>
        )}
      </CardContent>
    </Card>
  );
}
