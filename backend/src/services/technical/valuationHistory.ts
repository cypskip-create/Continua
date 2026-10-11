export type AnnualValuationPeriod = { fiscalYear:number; periodEnd:string; reportedAt:string; eps?:number|null; netIncome?:number|null; sharesOutstanding?:number|null; totalEquity?:number|null; revenue?:number|null; sourceUrls?:string[]|null };
export type ValuationRatio = 'pe'|'pb'|'ps';
export function annualRatioAt(periods:AnnualValuationPeriod[], price:number, at:string, ratio:ValuationRatio) {
  const date=at.slice(0,10);
  const p=periods.filter(p=>p.periodEnd<=date && p.reportedAt?.slice(0,10)<=date)
    .sort((a,b)=>b.fiscalYear-a.fiscalYear || b.reportedAt.localeCompare(a.reportedAt))[0];
  const positive=(n:unknown)=>typeof n==='number' && Number.isFinite(n) && n>0;
  const shares=p?.sharesOutstanding;
  const eps=p?.eps ?? (positive(shares)&&p?.netIncome!=null?p.netIncome/shares!:null);
  const denominator=ratio==='pe'?eps:positive(shares)?(ratio==='pb'?p?.totalEquity:p?.revenue)!/shares!:null;
  return {ratio:p&&positive(price)&&positive(denominator)?price/denominator!:null, price,
    fiscalYear:p?.fiscalYear??null, reportedAt:p?.reportedAt??null, denominator:positive(denominator)?denominator:null,
    sourceUrls:p?.sourceUrls??[]};
}
