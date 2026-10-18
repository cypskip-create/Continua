import type { ValuationResult } from "../api/valuationApi";

const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0;
export const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);const i=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2):null;};

/** Present the versioned Engine result. Older cached payloads never create client ratings. */
export function valueSignal(valuation:ValuationResult|undefined) {
  if(valuation?.rating?.methodologyVersion==='continua-value-rating-v3')return valuation.rating;
  return {price:positive(valuation?.currentPrice)?valuation.currentPrice:null,fair:null,low:null,high:null,spread:null,
    agreement:'Limited',bands:[30,75],upside:null,stars:null,models:[],excluded:valuation?.models.length??0,
    unavailableReason:'The current Engine rating is unavailable.',priceAsOf:valuation?.priceAsOf??null,
    calculatedAt:'',methodologyVersion:'unavailable',methodology:''};
}

/** A visible assumption, not an estimated future trading price. */
export function modelPricePath(price:number|null,fair:number|null,months=12,convergence=100) {
  if(!positive(price)||!positive(fair))return [];
  const horizon=Math.max(3,Math.min(36,months));
  const end=price+(fair-price)*Math.max(0,Math.min(100,convergence))/100;
  return [0,.25,.5,.75,1].map(fraction=>({month:`${Math.round(horizon*fraction)}m`,value:price+(end-price)*fraction}));
}
