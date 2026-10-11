import {computeRatios} from './ratiosEngine.js';
import {annualRatioAt} from '../technical/valuationHistory.js';
import type {FinancialRow} from './engineAnalytics.js';
export function reportedResearchRatios(securityId:string,quote:{lastPrice:number;timestamp:string;source?:string}|null,history:FinancialRow[],dividendPerShare:number|null,now=new Date()) {
 if(!quote||quote.source==='mock'||!Number.isFinite(quote.lastPrice)||quote.lastPrice<=0||!Number.isFinite(Date.parse(quote.timestamp))||Date.parse(quote.timestamp)>now.getTime())return null;
 const at=quote.timestamp.slice(0,10);
 const rows=history.filter(r=>r.periodEnd&&r.reportedAt&&r.periodEnd.slice(0,10)<=at&&r.reportedAt.slice(0,10)<=at&&r.sourceUrls?.some(u=>/^https:\/\//i.test(u)));
 const latest=[...rows].sort((a,b)=>b.fiscalYear-a.fiscalYear)[0];
 if(!latest)return null;
 const ratios=computeRatios({...latest,price:quote.lastPrice,dividendPerShareTtm:dividendPerShare});
 return {...ratios,securityId,asOf:quote.timestamp,
  pe:annualRatioAt(rows as Parameters<typeof annualRatioAt>[0],quote.lastPrice,quote.timestamp,'pe').ratio??undefined,
  pb:annualRatioAt(rows as Parameters<typeof annualRatioAt>[0],quote.lastPrice,quote.timestamp,'pb').ratio??undefined,
  ps:annualRatioAt(rows as Parameters<typeof annualRatioAt>[0],quote.lastPrice,quote.timestamp,'ps').ratio??undefined};
}
