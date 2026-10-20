import { Link } from 'react-router-dom';
import { financialNumber } from '@/lib/financialPresentation';

export function EngineCompanyHero({ data, sector }) {
  const q = data.quote;
  const change = q?.changePercent;
  return <section className="engine-company-hero" aria-label="Company overview">
    <div><p className="engine-kicker">{data.symbol} · {data.exchange}</p><h2>{data.symbol}</h2><p className="text-sm text-muted-foreground">{data.companyName}</p>{sector && <p className="mt-2 text-xs text-muted-foreground">{sector}</p>}</div>
    <div className="text-right"><p className="engine-quote">{q ? `${data.currency} ${q.lastPrice.toLocaleString(undefined, {maximumFractionDigits: 2})}` : 'Price unavailable'}</p>{Number.isFinite(change) && <p className={`mt-1 text-xs font-semibold ${change >= 0 ? 'text-bull' : 'text-bear'}`}>{change >= 0 ? '+' : ''}{financialNumber(q.change, data.currency)} ({change >= 0 ? '+' : ''}{change.toFixed(2)}%)</p>}<p className="mt-2 text-[0.625rem] text-muted-foreground">Quote {q?.timestamp ? new Date(q.timestamp).toLocaleString('en-KE', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Nairobi'}) : 'date unavailable'}</p><Link className="mt-2 block text-xs text-primary" to={`/stock/${encodeURIComponent(data.symbol)}`}>Stock details →</Link></div>
  </section>;
}

export function EngineHeadlineMetrics({ data }) {
  const latest = [...data.history].filter(r => !r.fiscalQuarter).sort((a,b) => a.fiscalYear-b.fiscalYear).at(-1);
  if (!latest) return <p className="text-sm text-muted-foreground">No annual financial observations are available yet.</p>;
  return <section aria-label="Latest annual financial highlights" className="engine-headline-metrics">
    <p className="engine-metric-basis">FY{latest.fiscalYear} · {latest.basis === 'publisher_observation' ? 'Mapped publisher observations' : 'Reported financial statements'}{!latest.currency ? ' · Currency not specified by source' : ` · ${latest.currency}`}</p>
    <dl>{[['Revenue','revenue'],['Net income','netIncome'],['EPS','eps']].map(([label,key]) => <div key={key}><dt>{label}</dt><dd>{key === 'eps' && Number.isFinite(latest[key]) ? `${latest.currency ? latest.currency+' ' : ''}${latest[key].toFixed(2)}` : financialNumber(latest[key], latest.currency ?? '')}</dd></div>)}</dl>
  </section>;
}
