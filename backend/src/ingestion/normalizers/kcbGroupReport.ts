import type {DetectedFinancialTable} from '../../types/market.js';
import {HistoricalConfirmSchema} from '../confirmHistoricalColumns.js';
export const KCB_GROUP_VERSION='kcb-six-column-group-2017-v1';
export function validateKcbGroupReport(text:string,securityId:string){
 if(securityId!=='NSE:KCB'||!/financial statements were approved by the Board of Directors on Wednesday, 7 March, 2018/i.test(text)||!/audited by\s+KPMG-Kenya/i.test(text))throw new Error('Exact KCB audit and approval date required');
 const pages=text.split('\f');if(pages.length!==3)throw new Error('Three-page KCB audited layout required');
 for(const page of pages){
  if(!/KCB GROUP PLC AUDITED RESULTS AND OTHER DISCLOSURES/.test(page)||!/FOR THE YEAR ENDED 31ST DECEMBER 2017/.test(page)||!/BANK\s+KCB GROUP PLC -COMPANY\s+KCB GROUP PLC-CONSOLIDATED/.test(page))throw new Error('KCB scope masthead changed');
  const headers=page.split('\n').filter(line=>/^\s*31-Dec-16\s+31-Dec-17\s+31-Dec-16\s+31-Dec-17\s+31-Dec-16\s+31-Dec-17\s*$/.test(line));
  if(headers.length!==1||!/^\s*Kshs 000\s+Kshs 000\s+Kshs 000\s+Kshs 000\s+Kshs 000\s+Kshs 000\s*$/im.test(page))throw new Error('Six ordered dated KES columns required');
 }
 const entries:{table:DetectedFinancialTable;confirmation:ReturnType<typeof HistoricalConfirmSchema.parse>}[]=[];
 for(const [pageIndex,type] of [[0,'balance'],[1,'income']] as const){
  const rows=pages[pageIndex]!.split('\n').map(line=>line.trim().split(/\s{2,}/)).filter(c=>c.length===7&&c.slice(1).every(v=>v==='-'||/^\(?-?\d[\d,]*(?:\.\d+)?\)?$/.test(v))).map(c=>({label:c[0]!.replace(/^\d+(?:\.\d+)?\s+/,''),values:c.slice(1)}));
  const find=(label:RegExp)=>{const matches=rows.filter(r=>label.test(r.label));if(matches.length!==1)throw new Error(`Missing or ambiguous KCB row: ${label.source}`);return matches[0]!.values.slice(4).map(v=>{if(v==='-')throw new Error('Required group value absent');return Number(v.replace(/[(),]/g,''))*(v.startsWith('(')?-1:1);});};
  const mapped:Record<string,number[]>={};
  if(type==='balance'){
   mapped.totalAssets=find(/^TOTAL ASSETS$/);mapped.totalLiabilities=find(/^TOTAL LIABILITIES$/);mapped.totalEquity=find(/^TOTAL SHAREHOLDERS' FUNDS$/);
   if(mapped.totalAssets.some((v,i)=>Math.abs(v-mapped.totalLiabilities![i]!-mapped.totalEquity![i]!)>3))throw new Error('Group assets do not reconcile');
  }else{
   mapped.revenue=find(/^TOTAL OPERATING INCOME$/);mapped.netIncome=find(/^Profit\/\(loss\) after tax and exceptional items$/i);mapped.eps=find(/^EARNINGS PER SHARE- DILUTED & BASIC KSHS$/);
   mapped.operatingExpenses=find(/^Total other operating expenses$/i);
   const netInterest=find(/^NET INTEREST INCOME\/\(LOSS\)$/),otherIncome=find(/^Total other operating income$/i),pretax=find(/^Profit\/\(loss\) after exceptional items$/i),currentTax=find(/^Current tax$/i),deferredTax=find(/^Deferred tax$/i);
   if(mapped.revenue.some((v,i)=>Math.abs(v-netInterest[i]!-otherIncome[i]!)>3)||pretax.some((v,i)=>Math.abs(v+currentTax[i]!+deferredTax[i]!-mapped.netIncome![i]!)>3))throw new Error('Group income or tax reconciliation failed');
  }
  entries.push({table:{title:`KCB group ${type}`,headerLine:'Bank 2016/17; Company 2016/17; Consolidated 2016/17',rows,method:KCB_GROUP_VERSION,confidence:1},confirmation:HistoricalConfirmSchema.parse({securityId,statementType:type,unitsVerified:true,periods:[2016,2017].map((year,i)=>({columnIndex:4+i,period:{periodType:'annual',fiscalYear:year,periodEnd:`${year}-12-31`,reportedAt:'2018-03-07',currency:'KES'},[type]:Object.fromEntries(Object.entries(mapped).map(([field,values])=>[field,values[i]!*(field==='eps'?1:1000)])),sourcePage:pageIndex+1,note:`${KCB_GROUP_VERSION}: native audited statement, only final two consolidated columns; KES thousands, unscaled EPS; board date and accounting equations verified. Bank-only and parent-company figures excluded. No cash-flow statement supplied.`}))})});
 }
 return entries;
}
