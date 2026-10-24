import { RollingNumber } from "@/components/shared/RollingNumber";
import { Link } from 'react-router-dom';
import { SparklineChart } from '@/components/shared/SparklineChart';
import { useSparklines } from '@/hooks/useSparklines';
import { QUICK_SYMBOLS } from '@/lib/homeSymbolPools';
import { useState } from 'react';

export function HomeQuickWatch({ watchlist, quotes }) {
  const [paused, setPaused] = useState(false);
  const symbols = [...new Set(watchlist.length ? watchlist.map(w => w.symbol.toUpperCase()) : QUICK_SYMBOLS)].slice(0, 20);
  const { getSparkline } = useSparklines(symbols);
  const group = (duplicate = false) => <div className={`home-watch-group ${duplicate ? 'home-watch-duplicate' : ''}`} aria-hidden={duplicate || undefined}>{symbols.map(symbol => {
    const quote = quotes[symbol];
    return <Link tabIndex={duplicate ? -1 : undefined} key={symbol} to={`/stock/${encodeURIComponent(symbol)}`} className="home-quick-quote"><div><strong>{symbol}</strong><p><RollingNumber value={quote ? `KES ${quote.lastPrice.toFixed(2)}` : 'Price unavailable'}/></p><p className={quote?.changePercent >= 0 ? 'text-bull' : 'text-bear'}><RollingNumber value={quote ? `${quote.changePercent >= 0 ? '↗ +' : '↘ '}${quote.changePercent.toFixed(2)}%` : '—'}/></p></div><SparklineChart width={42} height={26} data={getSparkline(symbol)} isPositive={(quote?.changePercent ?? 0) >= 0}/></Link>;
  })}</div>;
  return <div className="home-watch-strip" data-paused={paused}><div className="home-watch-viewport" onPointerDown={()=>setPaused(true)}><div className="home-watch-track">{group()}{group(true)}</div></div><button className="mt-2 text-[0.625rem] text-muted-foreground underline" type="button" aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused ? 'Resume Quick Watch' : 'Pause Quick Watch'}</button></div>;
}
