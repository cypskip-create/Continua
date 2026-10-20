import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { computePortfolioStats } from '@/lib/stockPrices';
import { hasHomeHistoryCoverage } from '@/lib/homePortfolioHistory';

const periods = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
const money = value => `KES ${Math.abs(value).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

export function HomePortfolioOverview({ portfolio, quotes, visible, onToggle }) {
  const [period, setPeriod] = useState('1M');
  const gradient = useId().replace(/:/g, '');
  const mapped = Object.fromEntries(Object.values(quotes).map(q => [q.symbol.toUpperCase(), { price: q.lastPrice, dayChangeAbs: q.change }]));
  const stats = computePortfolioStats(portfolio, mapped);
  const { points, isLoading } = usePortfolioHistory(portfolio, period);
  const covered = hasHomeHistoryCoverage(points, period);
  const ready = portfolio.length > 0 && stats.isFullyPriced;
  const signedMoney = value => `${value >= 0 ? '+' : '−'}${money(value)}`;
  const metric = (value, percentage) => visible ? <>{signedMoney(value)}<small>{percentage >= 0 ? '+' : ''}{percentage.toFixed(2)}%</small></> : '••••••';
  return <section className="home-portfolio" aria-label="Portfolio overview">
    <div className="home-portfolio-heading">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">Portfolio Value<button type="button" aria-label={visible ? 'Hide portfolio values' : 'Show portfolio values'} aria-pressed={!visible} className="grid h-9 w-9 place-items-center" onClick={onToggle}>{visible ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div>
      <div className="home-periods" aria-label="Portfolio chart timeframe">{periods.map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p === 'ALL' ? 'All' : p}</button>)}</div>
    </div>
    <p className="home-portfolio-value">{!visible ? '••••••' : ready ? money(stats.totalValue) : portfolio.length ? 'Awaiting prices' : 'KES 0'}</p>
    <p className={`home-portfolio-return ${stats.totalGain >= 0 ? 'text-bull' : 'text-bear'}`}>{ready ? visible ? `${stats.totalGain >= 0 ? '↗' : '↘'} ${signedMoney(stats.totalGain)} (${stats.gainPct >= 0 ? '+' : ''}${stats.gainPct.toFixed(2)}%)` : '••••••' : portfolio.length ? `${stats.pricedCount}/${portfolio.length} holdings priced` : 'Add your first holding to track your portfolio'}</p>
    <div className="home-portfolio-chart">
      {!visible ? <p>Portfolio chart hidden</p> : isLoading ? <p role="status">Loading historical prices…</p> : covered ? <ResponsiveContainer width="100%" height={180}><AreaChart data={points} margin={{ top: 15, right: 0, bottom: 0, left: 0 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.24}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={v => new Date(v).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })} tickLine={false} axisLine={false} minTickGap={40} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}/><YAxis orientation="right" width={42} domain={['auto', 'auto']} tickFormatter={v => Intl.NumberFormat('en', { notation: 'compact' }).format(v)} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}/><Tooltip labelFormatter={v => new Date(Number(v)).toLocaleDateString('en-KE')} formatter={v => [money(Number(v)), 'Current holdings']} contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }}/><Area type="linear" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${gradient})`} isAnimationActive={false}/></AreaChart></ResponsiveContainer> : <p>{period === '1D' ? 'Intraday portfolio history is not available.' : 'Not enough historical prices for this timeframe.'}</p>}
    </div>
    {visible && covered && <p className="home-chart-note">Daily closes × current shares; not historical account returns. {period === 'ALL' ? 'All available observations.' : ''}</p>}
    <div className="home-portfolio-metrics"><div><span>Day change</span><strong className={stats.todayGain >= 0 ? 'text-bull' : 'text-bear'}>{ready ? metric(stats.todayGain, stats.todayPct) : '—'}</strong></div><div><span>Total return</span><strong className={stats.totalGain >= 0 ? 'text-bull' : 'text-bear'}>{ready ? metric(stats.totalGain, stats.gainPct) : '—'}</strong></div><Link to="/track-investments"><span>Holdings</span><strong>{portfolio.length} <ChevronRight size={15}/></strong></Link></div>
  </section>;
}
