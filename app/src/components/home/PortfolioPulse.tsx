import { Link } from "react-router-dom";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";

/** A personal, evidence-based summary, not generated investment advice. */
export function PortfolioPulse({ showValues = true, title = 'Your portfolio pulse', compact = false }: { showValues?: boolean; title?: string; compact?: boolean }) {
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
  if (compact) return <section className="home-insights" aria-label="Insights for you"><div className="flex items-center justify-between gap-2"><h2 className="text-xs font-semibold">{title}</h2><Link to="/engine?tool=Portfolio" className="text-[0.625rem] font-semibold text-primary">View all →</Link></div><div className="py-3 border-b border-border/60"><h3 className="text-xs font-semibold">Holdings {daily >= 0 ? 'up' : 'down'} this session</h3><p className="mt-1 text-[0.6875rem] text-muted-foreground">{showValues ? `KES ${Math.abs(daily).toLocaleString(undefined, {maximumFractionDigits: 0})}` : '••••'} across {priced.length} priced positions.</p></div><div className="py-3"><h3 className="text-xs font-semibold">Largest position</h3><p className="mt-1 text-[0.6875rem] text-muted-foreground"><Link to={`/stock/${encodeURIComponent(largest.symbol)}`} className="text-primary">{largest.symbol}</Link> makes up {(largest.value / total * 100).toFixed(1)}% of priced holdings.{largest.value / total > .4 ? ' Review concentration risk.' : ''}</p></div><p className="text-[0.625rem] text-muted-foreground">Latest quotes · {priced.length}/{portfolio.filter(position => position.shares > 0).length} positions covered.</p></section>;
  return <section className="border-t border-border/70 pt-4 space-y-3" aria-label="Your portfolio pulse">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2><Link to={`/engine?symbol=${encodeURIComponent(largest.symbol)}&tool=Portfolio`} className="text-xs font-semibold text-primary">View all →</Link></div>
    <p className="text-sm leading-relaxed">Priced holdings are {daily >= 0 ? "up" : "down"} <span className={daily >= 0 ? "text-bull font-semibold" : "text-bear font-semibold"}>{showValues ? `KES ${Math.abs(daily).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "••••"}</span> for the latest market session.</p>
    <p className="text-xs text-muted-foreground"><Link className="font-semibold text-foreground" to={`/stock/${encodeURIComponent(largest.symbol)}`}>{largest.symbol}</Link> is your largest priced position at {(largest.value / total * 100).toFixed(1)}%{largest.value / total > 0.4 ? "; a large single-company exposure increases concentration risk." : "."} Coverage: {priced.length}/{portfolio.filter(position => position.shares > 0).length} positions. Based on current holdings and latest quotes, not personal investment advice.</p>
  </section>;
}
