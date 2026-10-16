export type PublisherPoint={year:number;value:number|null;raw?:string};
export type PublisherSeries={label:string;unit:string;points:PublisherPoint[]};
export type PublisherObservation={destination:string;status:string;category?:string;charts?:PublisherSeries[]};
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
