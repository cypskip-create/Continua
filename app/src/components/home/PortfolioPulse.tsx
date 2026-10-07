import { Link } from "react-router-dom";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";

/** A personal, evidence-based summary, not generated investment advice. */
export function PortfolioPulse({ showValues = true }: { showValues?: boolean }) {
  const { portfolio } = usePortfolio();
  const { quotes } = useLiveQuotes(portfolio.map(position => position.symbol));
  const priced = portfolio.flatMap(position => {
    const quote = quotes[position.symbol.toUpperCase()];
    return quote && position.shares > 0 ? [{ symbol: position.symbol, value: position.shares * quote.lastPrice, daily: position.shares * quote.change }] : [];
  }).sort((a, b) => b.value - a.value);
  const total = priced.reduce((sum, position) => sum + position.value, 0);
  const daily = priced.reduce((sum, position) => sum + position.daily, 0);
  const largest = priced[0];
  if (!largest || total <= 0) return null;
  return <section className="border-t border-border/70 pt-4 space-y-3" aria-label="Your portfolio pulse">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Your portfolio pulse</h2><Link to={`/engine?symbol=${encodeURIComponent(largest.symbol)}`} className="text-xs font-semibold text-primary">Explore Engine →</Link></div>
    <p className="text-sm leading-relaxed">Priced holdings are {daily >= 0 ? "up" : "down"} <span className={daily >= 0 ? "text-bull font-semibold" : "text-bear font-semibold"}>{showValues ? `KES ${Math.abs(daily).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "••••"}</span> for the latest market session.</p>
    <p className="text-xs text-muted-foreground"><Link className="font-semibold text-foreground" to={`/stock/${encodeURIComponent(largest.symbol)}`}>{largest.symbol}</Link> is your largest priced position at {(largest.value / total * 100).toFixed(1)}%{largest.value / total > 0.4 ? "; a large single-company exposure increases concentration risk." : "."} Coverage: {priced.length}/{portfolio.filter(position => position.shares > 0).length} positions. Based on current holdings and latest quotes, not personal investment advice.</p>
  </section>;
}
