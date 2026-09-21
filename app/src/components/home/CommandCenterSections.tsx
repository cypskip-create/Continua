import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Sparkles, Calendar, Coins, ArrowUpRight, ChevronRight } from "lucide-react";
import { AIThesisCard } from "@/components/stock/AIThesisCard";
import { getDivYield, getStockName } from "@/lib/stockPrices";
import { STOCK_POOL } from "@/lib/homeSymbolPools";
import { useExchange } from "@/hooks/useExchange";
import { getFundamentals } from "@/data/stockFundamentals";
import type { Quote } from "@/api/types";

const upcomingEarnings = [
  { symbol: "SCOM", date: "Tomorrow", time: "9:00 AM" },
  { symbol: "EQTY",   date: "Fri",      time: "Pre-market" },
  { symbol: "KCB",    date: "Next Mon", time: "Post-market" },
];

interface CommandCenterSectionsProps {
  /** Quotes for (at least) STOCK_POOL, fetched once by Home.tsx as part
   *  of its shared union quote batch — see Home.tsx's `homeQuotes`. This
   *  component used to fetch STOCK_POOL's quotes itself, which meant
   *  every Home page load fired this as its own separate request on top
   *  of Home's own portfolio/watchlist fetches and QuickTradeWidget's. */
  quotes: Record<string, Quote>;
}

export function CommandCenterSections({ quotes }: CommandCenterSectionsProps) {
  const navigate = useNavigate();
  const { exchange, exchangeMeta } = useExchange();

  // Derive every displayed number — and which stocks even qualify — from the
  // shared price/fundamentals data, then rank and take the top few. Nothing
  // here is hand-picked, so a section simply won't show a stock that the
  // underlying data doesn't actually support (e.g. no fake "upside" on a
  // stock trading above its analyst target).
  // "Undervalued" upside is computed against a synthetic analyst target
  // price (data/stockFundamentals.ts — the Data Layer has no real analyst-
  // target source yet, flagged as a separate follow-up from the price fix
  // below). The CURRENT price used in that comparison is real and live
  // only — a symbol with no live quote yet is excluded, never priced at a
  // fabricated fallback.
  const undervalued = STOCK_POOL
    .map((symbol) => {
      const price = quotes[symbol]?.lastPrice;
      if (price == null) return null;
      const targetAvg = getFundamentals(symbol, price).analystTargets.avg;
      const upside = price > 0 ? ((targetAvg - price) / price) * 100 : 0;
      return { symbol, name: getStockName(symbol), price, upside };
    })
    .filter((s): s is { symbol: string; name: string; price: number; upside: number } => s !== null && s.upside > 0)
    .sort((a, b) => b.upside - a.upside)
    .slice(0, 3);

  const highGrowth = STOCK_POOL
    .map((symbol) => {
      const price = quotes[symbol]?.lastPrice;
      if (price == null) return null;
      const growth = getFundamentals(symbol, price)
        .growthMetrics.find(g => g.label === "Revenue (3yr CAGR)")?.value ?? 0;
      return { symbol, name: getStockName(symbol), growth };
    })
    .filter((s): s is { symbol: string; name: string; growth: number } => s !== null)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 3);

  const dividendStars = STOCK_POOL
    .map((symbol) => ({ symbol, name: getStockName(symbol), yield: getDivYield(symbol) }))
    .sort((a, b) => b.yield - a.yield)
    .slice(0, 3);

  const Section = ({ title, icon: Icon, iconClass, children, actionLabel, onAction }: any) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="section-eyebrow flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${iconClass || "text-primary"}`} /> {title}
        </p>
        {actionLabel && (
          <button data-small-target onClick={onAction} className="text-[11px] text-primary font-semibold flex items-center">
            {actionLabel} <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="border-t border-border/60">{children}</div>
    </div>
  );

  const Row = ({ onClick, left, right }: { onClick: () => void; left: React.ReactNode; right: React.ReactNode }) => (
    <button
      data-small-target
      onClick={onClick}
      className="w-full flex items-center justify-between py-2.5 border-b border-border/40 hover:bg-muted/30 -mx-4 px-4 text-left transition-colors"
    >
      {left}
      {right}
    </button>
  );

  return (
    <div className="space-y-6">
      {undervalued.length > 0 && (
        <Section title="Undervalued Picks" icon={Coins} iconClass="text-bull" actionLabel="More" onAction={() => navigate("/screener")}>
          {undervalued.map(s => (
            <Row key={s.symbol} onClick={() => navigate(`/stock/${s.symbol}`)}
              left={<div><p className="text-xs font-semibold">{s.symbol} <span className="font-normal text-muted-foreground">· {s.name}</span></p><p className="text-[10px] text-muted-foreground tabular">KES {s.price.toFixed(2)}</p></div>}
              right={<div className="text-right"><p className="text-xs font-semibold text-bull tabular flex items-center gap-0.5 justify-end"><ArrowUpRight className="h-3 w-3" />+{s.upside.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground">upside</p></div>}
            />
          ))}
        </Section>
      )}

      <Section title="High-Growth Stocks" icon={TrendingUp} iconClass="text-accent">
        {highGrowth.map(s => (
          <Row key={s.symbol} onClick={() => navigate(`/stock/${s.symbol}`)}
            left={<div><p className="text-xs font-semibold">{s.symbol} <span className="font-normal text-muted-foreground">· {s.name}</span></p><p className="text-[10px] text-muted-foreground">3-yr revenue</p></div>}
            right={<p className="text-xs font-semibold text-accent tabular">+{s.growth.toFixed(1)}%</p>}
          />
        ))}
      </Section>

      <Section title="Strong Dividends" icon={Coins} iconClass="text-chart-3">
        {dividendStars.map(s => (
          <Row key={s.symbol} onClick={() => navigate(`/stock/${s.symbol}`)}
            left={<div><p className="text-xs font-semibold">{s.symbol} <span className="font-normal text-muted-foreground">· {s.name}</span></p><p className="text-[10px] text-muted-foreground">forward yield</p></div>}
            right={<p className="text-xs font-semibold text-chart-3 tabular">{s.yield.toFixed(1)}%</p>}
          />
        ))}
      </Section>

      <Section title="Upcoming Earnings" icon={Calendar} iconClass="text-primary">
        {upcomingEarnings.map(e => (
          <Row key={e.symbol} onClick={() => navigate(`/stock/${e.symbol}`)}
            left={<div><p className="text-xs font-semibold">{e.symbol} <span className="font-normal text-muted-foreground">· {getStockName(e.symbol)}</span></p><p className="text-[10px] text-muted-foreground">{e.time}</p></div>}
            right={<p className="text-xs font-semibold text-primary tabular">{e.date}</p>}
          />
        ))}
      </Section>

      <div>
        <p className="section-eyebrow mb-2 flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-primary" /> AI Insight of the Day</p>
        <AIThesisCard
          mode="market_insight" symbol={exchange} name={`${exchangeMeta.name} Market`} sector="Market"
          price={0} changePercent={0} pe="" eps="" dividend=""
          title={`Today's ${exchange} Insight`}
        />
      </div>
    </div>
  );
}