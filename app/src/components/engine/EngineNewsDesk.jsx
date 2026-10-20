import { useState } from 'react';
import { useSecurityNews } from '@/hooks/useSecurityNews';
import { useMarketNews } from '@/hooks/useMarketNews';
import { NewsReaderSheet } from '@/components/news/NewsReaderSheet';
import { Link } from 'react-router-dom';
import { mediaStoryUrl } from '@/lib/mediaRoute';

const filters = ['All', 'Company', 'Sector', 'Market', 'Regulation'];
export function EngineNewsDesk({ data }) {
  const [filter,setFilter]=useState('All'), [reading,setReading]=useState(null);
  const feed=useSecurityNews(data.symbol);
  const market=useMarketNews();
  const company=feed.news.length ? feed.news : data.news.map(n=>({...n,sourceName:n.source,excerpt:n.summary,symbols:[data.symbol],publishedAt:n.publishedAt,fromDigest:true}));
  const items=[...new Map([...company,...market.news].map(n=>[n.id,n])).values()].sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
  const shown=items.filter(n=>filter==='All'||filter==='Company'&&n.symbols?.includes(data.symbol)||filter==='Sector'&&n.impact?.topic==='sector'||filter==='Market'&&['markets','economy'].includes(n.category)||filter==='Regulation'&&['regulation','regulatory'].includes(n.impact?.topic));
  return <section className="engine-news-desk" aria-label="Company news">
    <div className="engine-segmented" aria-label="News category">{filters.map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}</button>)}</div>
    {feed.isLoading&&!items.length&&<p role="status" className="py-6 text-sm text-muted-foreground">Loading dated company news…</p>}
    {shown.map(n=><article key={n.id} className="engine-news-row"><div className="min-w-0 flex-1"><p className="text-[0.625rem] text-muted-foreground">{n.sourceName} · {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : 'Publication date unavailable'}</p>{n.fromDigest ? <Link className="mt-1 block text-sm font-semibold leading-snug" to={mediaStoryUrl(n.id)}>{n.headline}</Link> : <button type="button" className="mt-1 text-left text-sm font-semibold leading-snug" onClick={()=>setReading(n)}>{n.headline}</button>}<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.excerpt}</p></div>{n.imageUrl&&<img loading="lazy" src={n.imageUrl} alt="" className="h-20 w-20 shrink-0 object-cover"/>}</article>)}
    {!feed.isLoading&&!shown.length&&<p className="py-6 text-sm text-muted-foreground">No source-labelled {filter.toLowerCase()} stories are available for this company. Categories are not inferred from unrelated headlines.</p>}
    <p className="mt-3 text-[0.625rem] text-muted-foreground">Company and wider market stories. Company filtering requires an issuer link; other categories use source metadata. Missing images and dates are not invented.</p>
    <NewsReaderSheet item={reading} open={!!reading} onOpenChange={open=>{if(!open)setReading(null);}}/>
  </section>;
}
