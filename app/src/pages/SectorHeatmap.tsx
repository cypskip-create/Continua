import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockHeatmap } from "@/components/home/StockHeatmap";
import { CANONICAL_SYMBOLS, STOCK_META } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Waves, BarChart3 } from "lucide-react";

// Derived from the shared reference table (same list AllStocks, the Screener,
// and Compare use) so this heatmap can't show a stock that disagrees with the
// rest of the app. Change% and market cap for tile sizing come ONLY from live
// quotes below (useLiveQuotes) — a symbol with no live quote yet is simply
// excluded from the grid, never shown with a fabricated change/size.
//
// 1W/1M/YTD ranges and "Capital Flow" mode used to be powered by a seeded
// pseudo-random generator (removed along with the rest of the fabricated
// price engine — see stockPrices.ts). There's no real batch multi-range
// performance source wired up yet (the real per-symbol /historical/:symbol
// /performance endpoint exists but isn't practical to call once per NSE
// symbol per page load), so those options are disabled below rather than
// re-fabricated. Flagged as a follow-up: a batch performance endpoint
// mirroring GET /historical/sparklines would unlock this properly.
type ChangeRange = "1D" | "1W" | "1M" | "YTD";

const SECTORS = ["All", ...Array.from(new Set(CANONICAL_SYMBOLS.map(s => STOCK_META[s].sector))).sort()];
const RANGES: { value: ChangeRange; available: boolean }[] = [
  { value: "1D", available: true },
  { value: "1W", available: false },
  { value: "1M", available: false },
  { value: "YTD", available: false },
];

export default function SectorHeatmap() {
  const navigate = useNavigate();
  const [sector, setSector] = useState<string>("All");
  const [range, setRange] = useState<ChangeRange>("1D");
  const [flowMode, setFlowMode] = useState(false);

  const { quotes } = useLiveQuotes(CANONICAL_SYMBOLS);
  const ALL_STOCKS = useMemo(() => {
    return CANONICAL_SYMBOLS
      .map(symbol => {
        const q = quotes[symbol];
        if (!q) return null;
        return {
          symbol,
          name: STOCK_META[symbol].name,
          change: +q.changePercent.toFixed(2),
          marketCap: (q.marketCap ?? 0) / 1e9, // billions, tile-sizing only
          sector: STOCK_META[symbol].sector,
        };
      })
      .filter((s): s is { symbol: string; name: string; change: number; marketCap: number; sector: string } => s !== null);
  }, [quotes]);

  const filtered = useMemo(
    () => sector === "All" ? ALL_STOCKS : ALL_STOCKS.filter(s => s.sector === sector),
    [sector, ALL_STOCKS]
  );

  const sectorRollup = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; cap: number }>();
    ALL_STOCKS.forEach(s => {
      const cur = map.get(s.sector) || { sum: 0, count: 0, cap: 0 };
      map.set(s.sector, { sum: cur.sum + s.change * s.marketCap, count: cur.count + 1, cap: cur.cap + s.marketCap });
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, change: v.cap > 0 ? v.sum / v.cap : 0, count: v.count }))
      .sort((a, b) => b.change - a.change);
  }, [ALL_STOCKS]);

  return (
    <div className="page-canvas min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9" data-small-target>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-base font-semibold">Sector Heatmap</h1>
            <p className="text-[11px] text-muted-foreground">
              NSE · size = market cap · colour = today's performance
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {/* Performance vs Capital Flow — Capital Flow needs a real batch
            volume×price data source not wired up yet, so it's disabled
            rather than shown with fabricated numbers. */}
        <div className="flex rounded-full bg-muted/50 p-0.5">
          <button
            data-small-target
            onClick={() => setFlowMode(false)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${!flowMode ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Performance
          </button>
          <button
            data-small-target
            disabled
            title="Coming soon — needs a real capital-flow data source"
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold text-muted-foreground/50 cursor-not-allowed"
          >
            <Waves className="h-3.5 w-3.5" /> Capital Flow
          </button>
        </div>

        {/* Range pills — only 1D has a real live source right now */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {RANGES.map(({ value: r, available }) => (
            <button
              key={r}
              data-small-target
              disabled={!available}
              title={available ? undefined : "Coming soon — needs a real historical performance source"}
              onClick={() => available && setRange(r)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                range === r ? 'brand-active' : available ? 'text-muted-foreground hover:text-foreground border border-border/60' : 'text-muted-foreground/40 border border-border/30 cursor-not-allowed'
              }`}
            >{r}</button>
          ))}
        </div>

        {flowMode && (
          <p className="text-[11px] text-muted-foreground -mt-3">
            Tile size reflects net capital moving in or out of each stock over {range}, not company size — spot where the money's going, not just who's biggest.
          </p>
        )}

        {/* Sector rollup */}
        <div>
          <p className="section-eyebrow mb-2">Sector Performance</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sectorRollup.map(s => (
              <button
                key={s.name}
                data-small-target
                onClick={() => setSector(s.name)}
                className={`text-left rounded-xl p-3 transition-all ${s.change >= 0 ? 'bg-bull/10 hover:bg-bull/15' : 'bg-bear/10 hover:bg-bear/15'} ${sector === s.name ? 'ring-2 ring-foreground/60' : ''}`}
              >
                <p className="text-xs font-semibold">{s.name}</p>
                <p className={`text-base font-bold tabular ${s.change >= 0 ? 'text-bull' : 'text-bear'} flex items-center gap-1`}>
                  {s.change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.count} stocks</p>
              </button>
            ))}
          </div>
        </div>

        {/* Sector filter chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          {SECTORS.map(s => (
            <button
              key={s}
              data-small-target
              onClick={() => setSector(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${sector === s ? 'brand-active' : 'border border-border/60 text-muted-foreground hover:text-foreground'}`}
            >{s}</button>
          ))}
        </div>

        {/* Heatmap */}
        <div>
          <p className="section-eyebrow mb-2">{sector === "All" ? "Full NSE" : sector} · {filtered.length} stocks</p>
          <StockHeatmap stocks={filtered} />
        </div>
      </div>
    </div>
  );
}