import type { ValuationResult } from "../api/valuationApi";

const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0;
export const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);const i=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2):null;};

/** Continua v2: robust model centre, consistent prices and wider bands for weak agreement.
 * Model agreement is NOT analyst uncertainty or a statistical confidence interval.
 */
export function valueSignal(valuation:ValuationResult|undefined) {
  const usable=valuation?.models.filter(m=>positive(m.fairValue)&&positive(m.currentPrice))??[];
  const price=positive(valuation?.currentPrice)?valuation.currentPrice:median(usable.map(m=>m.currentPrice));
  const models=price?usable.filter(m=>Math.abs(m.currentPrice/price-1)<=.01):[];
  const fair=median(models.map(m=>m.fairValue!));
  const low=models.length?Math.min(...models.map(m=>m.fairValue!)):null;
  const high=models.length?Math.max(...models.map(m=>m.fairValue!)):null;
  const spread=fair&&low!=null&&high!=null?(high-low)/fair:null;
  const agreement=models.length<2?"Limited":spread!>.5?"Wide":spread!>.2?"Mixed":"Close";
  const bands=agreement==="Close"?[10,30]:agreement==="Mixed"?[20,50]:[30,75];
  const upside=fair&&price?(fair/price-1)*100:null;
  // Round only for classification so exact +/- band boundaries remain symmetric.
  const bandUpside=upside==null?null:Math.round(upside*1e8)/1e8;
  const stars=bandUpside==null?null:bandUpside>=bands[1]?5:bandUpside>=bands[0]?4:bandUpside<=-bands[1]?1:bandUpside<=-bands[0]?2:3;
  return {price,fair,low,high,spread,agreement,bands,upside,stars,models,excluded:(valuation?.models.length??0)-models.length};
}

/** A visible assumption, not an estimated future trading price. */
export function modelPricePath(price:number|null,fair:number|null,months=12,convergence=100) {
  if(!positive(price)||!positive(fair))return [];
  const horizon=Math.max(3,Math.min(36,months));
  const end=price+(fair-price)*Math.max(0,Math.min(100,convergence))/100;
  return [0,.25,.5,.75,1].map(fraction=>({month:`${Math.round(horizon*fraction)}m`,value:price+(end-price)*fraction}));
}
