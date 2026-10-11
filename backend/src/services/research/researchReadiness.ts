import { createHash } from 'node:crypto';
import type { FinancialRow } from './engineAnalytics.js';

export const RESEARCH_METHOD_VERSION = 'nse-research-2026-10-v1';
type QuoteInput = {lastPrice:number;timestamp:string;source?:string} | null;
const finite = (v:unknown):v is number => typeof v === 'number' && Number.isFinite(v);
const dated = (v:unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v));
export function researchReadiness(input:{quote:QuoteInput;history:FinancialRow[];unavailable:string[];technicalObservations:number;estimateCount:number;ownershipCount:number},now=new Date()) {
  const today=now.toISOString().slice(0,10);
  const rows=[...input.history].sort((a,b)=>a.fiscalYear-b.fiscalYear);
  const issues:{id:string;severity:'warning'|'blocked';message:string;nextTool:string}[]=[];
  const add=(id:string,severity:'warning'|'blocked',message:string,nextTool='Evidence')=>issues.push({id,severity,message,nextTool});
  const matrix=rows.map(r=>({year:r.fiscalYear,periodEnd:r.periodEnd??null,availableAt:r.reportedAt??null,
    sourceCount:(r.sourceUrls??[]).filter(u=>/^https:\/\//i.test(u)).length,
    fields:{revenue:finite(r.revenue),earnings:finite(r.netIncome),eps:finite(r.eps),assets:finite(r.totalAssets),cashFlow:finite(r.operatingCashFlow)},
    usable:dated(r.periodEnd)&&dated(r.reportedAt)&&r.periodEnd!.slice(0,10)<=today&&r.reportedAt!.slice(0,10)<=today&&(r.sourceUrls??[]).some(u=>/^https:\/\//i.test(u))}));
  const latest=matrix.at(-1),years=[...new Set(matrix.map(r=>r.year))];
  const gaps:number[]=[];
  for(let y=years[0]??0;years.length&&y<years.at(-1)!;y++)if(!years.includes(y))gaps.push(y);
  if(!rows.length)add('financials-missing','blocked','No validated annual statements are available. Downloaded files alone do not establish financial coverage.','Earnings & Reports');
  if(matrix.some(r=>!r.usable))add('provenance','blocked','Some stored periods lack a dated HTTPS source or have future dates. Do not use them as validated evidence.');
  if(new Set(rows.map(r=>`${r.fiscalYear}:${r.fiscalQuarter??'FY'}`)).size!==rows.length)add('duplicate-period','blocked','Duplicate periods need reconciliation before comparing growth.');
  if(gaps.length)add('year-gaps','warning',`Missing annual periods: ${gaps.join(', ')}. Growth cannot bridge these gaps as a one-year change.`,'Earnings & Reports');
  if(latest&&now.getUTCFullYear()-latest.year>2)add('old-financials','warning',`The latest annual financial period is FY${latest.year}; this is old evidence, not current-year earnings.`,'Earnings & Reports');
  const quote=input.quote;
  const quoteValid=!!quote&&finite(quote.lastPrice)&&quote.lastPrice>0&&dated(quote.timestamp)&&Date.parse(quote.timestamp)<=now.getTime()&&quote.source!=='mock';
  if(!quoteValid)add('quote-unusable','blocked','A positive, dated, non-mock quote is required for current-price analysis.','Valuation');
  else if(now.getTime()-Date.parse(quote!.timestamp)>7*86400000)add('quote-stale','warning','The last quote is over seven days old. A recent refresh does not make that price live.','Valuation');
  if(input.unavailable.length)add('partial-response','warning',`${[...new Set(input.unavailable)].join(', ')} could not load. Missing responses are not zero values.`);
  const eligibility=(id:string,label:string,count:number,needed:number,reason:string)=>({id,label,status:count>=needed?'available' as const:count>0?'limited' as const:'unavailable' as const,observed:count,needed,reason});
  const usableYears=matrix.filter(r=>r.usable).map(r=>r.year);
  const adjacent=usableYears.filter(y=>usableYears.includes(y-1)).length;
  const capabilities=[
    eligibility('statements','Reported financials',matrix.filter(r=>r.usable).length,1,'Needs source-backed statements with real period and publication dates.'),
    eligibility('growth','Annual growth',adjacent,1,'Requires consecutive fiscal years; sparse endpoints are not annual growth.'),
    eligibility('technicals','Price-indicator inputs',input.technicalObservations,35,'A minimum-history screening check, not proof every indicator is computable. Uses dated provider bars; corporate-action adjustment requires separate verification.'),
    eligibility('estimates','Analyst estimates',input.estimateCount,1,'Sourced estimates only; user scenarios do not count as analyst coverage.'),
    eligibility('ownership','Disclosed ownership',input.ownershipCount,1,'Disclosures are dated snapshots, not evidence of trading.'),
  ];
  const evidence={quote:quote?{price:quote.lastPrice,asOf:quote.timestamp,source:quote.source??null}:null,history:rows.map(r=>Object.fromEntries(Object.keys(r).sort().map(k=>[k,k==='sourceUrls'?[...(r.sourceUrls??[])].sort():(r as unknown as Record<string,unknown>)[k]])))};
  const snapshotId=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  return {methodVersion:RESEARCH_METHOD_VERSION,snapshotId,status:issues.some(i=>i.severity==='blocked')?'incomplete':issues.length?'limited':'supported',issues,matrix,gaps,capabilities,quoteAsOf:quote?.timestamp??null,
    methodology:'Coverage describes available evidence, not investment quality or accuracy probability. No missing value is replaced with zero. Same evidence has the same snapshot ID; retrieval time is separate.'};
}
