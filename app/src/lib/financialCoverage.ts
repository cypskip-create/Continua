export function isPublishedFinancialPeriod(row:{periodEnd?:string;reportedAt?:string},today=new Date().toISOString().slice(0,10)) {
  return (!row.periodEnd || row.periodEnd.slice(0,10)<=today) && (!row.reportedAt || row.reportedAt.slice(0,10)<=today);
}
export function financialYearCoverage(rows:{fiscalYear:number;sourceUrls?:string[]|null}[]) {
  const years=[...new Set(rows.map(row=>row.fiscalYear))].sort((a,b)=>a-b);
  const missing:number[]=[];
  for(let year=years[0]??0;years.length && year<years.at(-1)!;year++)if(!years.includes(year))missing.push(year);
  return {years,missing,sourceBackedYears:[...new Set(rows.filter(row=>row.sourceUrls?.length).map(row=>row.fiscalYear))]};
}
