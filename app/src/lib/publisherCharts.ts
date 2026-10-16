import type {FinancialHistoryEntry} from '@/api/types';
export type PublisherPoint={year:number;value:number|null;raw?:string};
export type PublisherSeries={label:string;unit:string;points:PublisherPoint[]};
export type PublisherObservation={destination:string;status:string;category?:string;charts?:PublisherSeries[]};
const fields=new Set(['revenue','netIncome','eps','totalAssets','totalLiabilities','totalEquity','currentAssets','currentLiabilities','cash','totalDebt','sharesOutstanding','operatingIncome','ebitda','grossProfit','operatingExpenses','costOfRevenue','operatingCashFlow','investingCashFlow','financingCashFlow','freeCashFlow']);
export function publisherFinancialPeriods(observations:(PublisherObservation&{financialFields?:{metric:string;year:number;value:number}[]})[]):FinancialHistoryEntry[]{
 const years=new Map<number,FinancialHistoryEntry>();
 const seen=new Map<string,number>();const conflicts=new Set<string>();
 for(const o of observations){if(o.status!=='publisher_observation')continue;
  for(const f of o.financialFields||[]){
   if(!fields.has(f.metric)||!Number.isInteger(f.year)||!Number.isFinite(f.value))continue;
   const id=`${f.year}:${f.metric}`;
   if(seen.has(id)&&seen.get(id)!==f.value){conflicts.add(id);continue;}seen.set(id,f.value);
   if(!years.has(f.year))years.set(f.year,{fiscalYear:f.year,revenue:null,netIncome:null,eps:null,basis:'publisher_observation'});
   (years.get(f.year)! as unknown as Record<string,unknown>)[f.metric]=f.value;
  }
 }
 for(const id of conflicts){const [year,metric]=id.split(':');(years.get(Number(year))! as unknown as Record<string,unknown>)[metric]=null;}
 return [...years.values()].sort((a,b)=>a.fiscalYear-b.fiscalYear);
}
/** Render Engine outputs only; no source-cell parsing or guessed accounting mappings in the browser. */
export function publisherChartGroups(observations:PublisherObservation[]) {
 const groups=new Map<string,PublisherSeries[]>();
 for(const o of observations){
  if(o.destination!=='financials'||o.status!=='publisher_observation'||!o.category||groups.has(o.category))continue;
  const labels=new Set<string>();
  const series=(o.charts||[]).flatMap(s=>{
   if(!s.label||labels.has(s.label)||!Array.isArray(s.points)||!s.points.length)return [];
   const years=new Set<number>();
   for(const p of s.points){if(!Number.isInteger(p.year)||years.has(p.year)||(p.value!==null&&!Number.isFinite(p.value)))return [];years.add(p.year);}
   const points=[...s.points].sort((a,b)=>a.year-b.year);
   if(points.at(-1)!.year-points[0].year>100||!points.some(p=>p.value!==null))return [];
   const byYear=new Map(points.map(p=>[p.year,p]));
   const aligned:PublisherPoint[]=[];
   for(let year=points[0].year;year<=points.at(-1)!.year;year++)aligned.push(byYear.get(year)||{year,value:null});
   labels.add(s.label);return [{...s,points:aligned}];
  });
  if(series.length)groups.set(o.category,series);
 }
 const order=['Profit/Loss','Cash Flow','Assets','Liabilities',"Shareholder's Equity"];
 return [...groups].map(([category,series])=>({category,series})).sort((a,b)=>{const rank=(c:string)=>order.includes(c)?order.indexOf(c):order.length;return rank(a.category)-rank(b.category);});
}
