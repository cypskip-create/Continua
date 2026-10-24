import { RollingNumber } from "@/components/shared/RollingNumber";
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { computePortfolioStats } from '@/lib/stockPrices';
import { hasHomeHistoryCoverage } from '@/lib/homePortfolioHistory';
import { chartTimeScrubIndex } from '@/lib/chartScrub';

const periods = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
const money = value => `KES ${Math.abs(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HomePortfolioOverview({ portfolio, quotes, visible, onToggle }) {
  const [period, setPeriod] = useState('1M');
  const [inspected, setInspected] = useState(null);
  const gradient = useId().replace(/:/g, '');
  const mapped = Object.fromEntries(Object.values(quotes).map(q => [q.symbol.toUpperCase(), { price: q.lastPrice, dayChangeAbs: q.change }]));
  const stats = computePortfolioStats(portfolio, mapped);
  const { points, isLoading } = usePortfolioHistory(portfolio, period);
  const covered = hasHomeHistoryCoverage(points, period);
  const displayValue = inspected?.value ?? stats.totalValue;
  const displayGain = displayValue - stats.totalCost;
  const displayPct = stats.totalCost > 0 ? displayGain / stats.totalCost * 100 : 0;
  const color = (points.at(-1)?.value ?? 0) >= (points[0]?.value ?? 0) ? 'hsl(var(--bull))' : 'hsl(var(--bear))';
  const inspectPointer = event => {
    if (!visible || !covered) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = points[chartTimeScrubIndex(event.clientX, rect.left, rect.width, points.map(point=>point.timestamp), 42)];
    if (point) setInspected(point);
  };
  const ready = portfolio.length > 0 && stats.isFullyPriced;
  const signedMoney = value => `${value >= 0 ? '+' : '−'}${money(value)}`;
  const metric = (value, percentage) => visible ? <><RollingNumber value={signedMoney(value)}/><small>{percentage >= 0 ? '+' : ''}<RollingNumber value={percentage.toFixed(2)}/>%</small></> : '••••••';
  return <section className="home-portfolio" aria-label="Portfolio overview">
    <div className="home-portfolio-heading">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">Portfolio Value<button type="button" aria-label={visible ? 'Hide portfolio values' : 'Show portfolio values'} aria-pressed={!visible} className="grid h-9 w-9 place-items-center" onClick={onToggle}>{visible ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div>
      <div className="home-periods" aria-label="Portfolio chart timeframe">{periods.map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => {setPeriod(p); setInspected(null);}}>{p === 'ALL' ? 'All' : p}</button>)}</div>
    </div>
    <p className="home-portfolio-value">{!visible ? '••••••' : ready ? <RollingNumber value={money(displayValue)}/> : portfolio.length ? 'Awaiting prices' : 'KES 0.00'}</p>
    <p className={`home-portfolio-return ${displayGain >= 0 ? 'text-bull' : 'text-bear'}`}>{ready ? visible ? <>{displayGain >= 0 ? '↗' : '↘'} <RollingNumber value={signedMoney(displayGain)}/> (<RollingNumber value={`${displayPct >= 0 ? '+' : ''}${displayPct.toFixed(2)}%`}/>){inspected && <span> · {new Date(inspected.timestamp).toLocaleDateString('en-KE')}</span>}</> : '••••••' : portfolio.length ? `${stats.pricedCount}/${portfolio.length} holdings priced` : 'Add your first holding to track your portfolio'}</p>
    <div className="home-portfolio-chart relative touch-none select-none" onPointerDown={event => {event.currentTarget.setPointerCapture(event.pointerId); inspectPointer(event);}} onPointerMove={inspectPointer} onPointerUp={event => {if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);setInspected(null);}} onPointerCancel={() => setInspected(null)} onPointerLeave={event => {if(!event.currentTarget.hasPointerCapture(event.pointerId))setInspected(null);}}>
      {inspected && visible && covered && <div aria-hidden="true" className="pointer-events-none absolute top-4 bottom-7 z-10 w-px bg-muted-foreground/50" style={{left: 'calc((100% - 42px) * '+((inspected.timestamp-points[0].timestamp)/Math.max(1,points.at(-1).timestamp-points[0].timestamp))+')'}}/>}
      {!visible ? <p>Portfolio chart hidden</p> : isLoading ? <p role="status">Loading historical prices…</p> : covered ? <ResponsiveContainer width="100%" height={180}><AreaChart data={points} margin={{ top: 15, right: 0, bottom: 0, left: 0 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.24}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={v => new Date(v).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })} tickLine={false} axisLine={false} minTickGap={40} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}/><YAxis orientation="right" width={42} domain={['auto', 'auto']} tickFormatter={v => Intl.NumberFormat('en', { notation: 'compact' }).format(v)} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}/><Tooltip content={() => null} cursor={false}/><Area type="linear" dataKey="value" activeDot={false} stroke={color} strokeWidth={1.5} fill={`url(#${gradient})`} isAnimationActive={false}/></AreaChart></ResponsiveContainer> : <p>{period === '1D' ? 'Intraday portfolio history is not available.' : 'Not enough historical prices for this timeframe.'}</p>}
    </div>
    {visible && covered && <p className="home-chart-note">Value of today’s holdings at historical closing prices. {points.at(-1)?.date ? ' Prices through '+new Date(points.at(-1).timestamp).toLocaleDateString('en-KE')+'.' : ''}</p>}
    <div className="home-portfolio-metrics"><div><span>Day change</span><strong className={stats.todayGain >= 0 ? 'text-bull' : 'text-bear'}>{ready ? metric(stats.todayGain, stats.todayPct) : '—'}</strong></div><div><span>Total return</span><strong className={stats.totalGain >= 0 ? 'text-bull' : 'text-bear'}>{ready ? metric(stats.totalGain, stats.gainPct) : '—'}</strong></div><Link to="/track-investments"><span>Holdings</span><strong><RollingNumber value={portfolio.length}/> <ChevronRight size={15}/></strong></Link></div>
  </section>;
}
