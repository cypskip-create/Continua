import type { Quote } from '../api/types';
import type { MarketIntelligence } from '../api/marketResearchApi';
/** Reuse real dated quotes if the optional research endpoint is unavailable. */
export function marketQuoteSummary(quotes: Quote[], sectors: Record<string,{sector:string}>): MarketIntelligence | undefined {
  const rows=quotes.filter(q=>q.exchange==='NSE' && sectors[q.symbol] && q.lastPrice>0 && q.changePercent!=null && Number.isFinite(q.changePercent));
  if(!rows.length)return undefined;
  const labels=['≤−7%','−7–−5%','−5–−3%','−3–0%','0%','0–3%','3–5%','5–7%','≥7%'];
  const counts=labels.map(()=>0);
  for(const q of rows){const v=q.changePercent!;counts[v===0?4:v<=-7?0:v<=-5?1:v<=-3?2:v<0?3:v<3?5:v<5?6:v<7?7:8]++;}
  return {coverage:rows.length,advancing:rows.filter(q=>q.changePercent!>0).length,declining:rows.filter(q=>q.changePercent!<0).length,unchanged:rows.filter(q=>q.changePercent===0).length,
    distribution:labels.map((label,i)=>({label,count:counts[i]})),
    sectors:[...new Set(rows.map(q=>sectors[q.symbol].sector))].map(name=>{const members=rows.filter(q=>sectors[q.symbol].sector===name);return {name,coverage:members.length,changePercent:members.reduce((sum,q)=>sum+q.changePercent!,0)/members.length,symbols:members.map(q=>q.symbol)};}).sort((a,b)=>b.changePercent-a.changePercent),
    monitor:[...rows].sort((a,b)=>Math.abs(b.changePercent!)-Math.abs(a.changePercent!)).slice(0,20).map(q=>({symbol:q.symbol,changePercent:q.changePercent!,volume:q.volume??null,timestamp:q.timestamp,signal:Math.abs(q.changePercent!)>=5?'Large session move':'Session movement'})),
    methodology:`Calculated from available NSE quote snapshots. Latest quote: ${rows.map(q=>q.timestamp).sort().at(-1)}. Coverage may be partial; quotes may have different dates. Sector changes are equally weighted, not an official index.`};
}
