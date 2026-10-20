import { Link } from 'react-router-dom';
import { SparklineChart } from '@/components/shared/SparklineChart';
import { useSparklines } from '@/hooks/useSparklines';
import { QUICK_SYMBOLS } from '@/lib/homeSymbolPools';

export function HomeQuickWatch({ watchlist, quotes }) {
  const symbols = [...new Set(watchlist.length ? watchlist.map(w => w.symbol.toUpperCase()) : QUICK_SYMBOLS)].slice(0, 3);
  const { getSparkline } = useSparklines(symbols);
  return <div className="home-quick-watch">{symbols.map(symbol => {
    const quote = quotes[symbol];
    return <Link key={symbol} to={`/stock/${encodeURIComponent(symbol)}`} className="home-quick-quote"><div><strong>{symbol}</strong><p>{quote ? `KES ${quote.lastPrice.toFixed(2)}` : 'Price unavailable'}</p><p className={quote?.changePercent >= 0 ? 'text-bull' : 'text-bear'}>{quote ? `${quote.changePercent >= 0 ? '↗ +' : '↘ '}${quote.changePercent.toFixed(2)}%` : '—'}</p></div><SparklineChart width={42} height={26} data={getSparkline(symbol)} isPositive={(quote?.changePercent ?? 0) >= 0}/></Link>;
  })}</div>;
}
