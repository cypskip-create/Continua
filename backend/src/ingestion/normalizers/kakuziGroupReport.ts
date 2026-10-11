import type {DetectedFinancialTable} from '../../types/market.js';
import {HistoricalConfirmSchema} from '../confirmHistoricalColumns.js';
export const KAKUZI_GROUP_VERSION='kakuzi-group-annual-v1';
/** Visually verified single-page group layout. Net-assets presentation needs
 * explicit gross reconstruction; cash is separate from other current assets. */
export function validateKakuziGroupReport(text:string,securityId:string){
 if(securityId!=='NSE:KUKZ'||!/^\s*KAKUZI PLC\s*$/im.test(text)||!/ANNOUNCEMENT OF GROUP RESULTS FOR THE YEAR ENDED\s+31 DECEMBER 2017/i.test(text)||!/audited by Deloitte & Touche/i.test(text)||!/BY ORDER OF THE BOARD\s+G H Mclean\s+Chairman\s+22 March 2018/i.test(text))throw new Error('Unsupported Kakuzi audited masthead or board date');
 const incomeStart=text.indexOf('Condensed consolidated statement of profit or loss'),balanceStart=text.search(/Condensed Consolidated Statement of Financial Position/i),end=text.indexOf('OVERVIEW:');
 if(incomeStart<0||balanceStart<=incomeStart||end<=balanceStart)throw new Error('Unique ordered Kakuzi statement blocks required');
 const entries:{table:DetectedFinancialTable;confirmation:ReturnType<typeof HistoricalConfirmSchema.parse>}[]=[];
 for(const type of ['income','balance'] as const){
  const block=text.slice(type==='income'?incomeStart:balanceStart,type==='income'?balanceStart:end);
  if((block.match(/31 December 2017\s+31 December 2016/g)??[]).length!==1||(block.match(/Shs’000/g)??[]).length!==2)throw new Error('Exact comparative order and KES thousands required');
  const rows=block.split('\n').map(line=>line.trim().split(/\t+|\s{2,}/).map(cell=>cell.trim().replace(/\s+\)/g,')'))).filter(c=>c.length===3&&c.slice(1).every(v=>/^\(?\d[\d,]*(?:\.\d+)?\)?$/.test(v))).map(c=>({label:c[0]!,values:c.slice(1)}));
  const find=(label:RegExp)=>{const matches=rows.filter(r=>label.test(r.label));if(matches.length!==1)throw new Error(`Missing or duplicate row: ${label.source}`);return matches[0]!.values.map(v=>Number(v.replace(/[(),]/g,''))*(v.startsWith('(')?-1:1));};
  const mapped:Record<string,number[]>={};
  if(type==='income'){
   mapped.revenue=find(/^Sales$/);mapped.netIncome=find(/^Profit for the year$/);mapped.eps=find(/^Basic and diluted earnings per ordinary share$/);
   if(!/Earnings per share \(Shs\):/.test(block))throw new Error('Unscaled EPS units required');
   const pretax=find(/^Profit before income tax$/),tax=find(/^Income tax expense$/);
   if(pretax.some((p,i)=>Math.abs(p-Math.abs(tax[i]!)-mapped.netIncome![i]!)>2))throw new Error('Income tax reconciliation failed');
  }else{
   mapped.totalEquity=find(/^Total equity$/);mapped.cash=find(/^Cash and bank balances$/);
   const noncurrent=find(/^Non-current assets$/),current=find(/^Current assets$/),noncurrentLiabilities=find(/^Non-current liabilities$/),currentLiabilities=find(/^Current liabilities$/),netcurrent=find(/^Net current assets$/);
   mapped.currentAssets=current.map((v,i)=>v+mapped.cash![i]!);mapped.currentLiabilities=currentLiabilities.map(Math.abs);
   mapped.totalAssets=noncurrent.map((v,i)=>v+mapped.currentAssets![i]!);mapped.totalLiabilities=noncurrentLiabilities.map((v,i)=>v+mapped.currentLiabilities![i]!);
   if(mapped.totalAssets.some((v,i)=>Math.abs(v-mapped.totalLiabilities![i]!-mapped.totalEquity![i]!)>2)||netcurrent.some((v,i)=>Math.abs(v-mapped.currentAssets![i]!+mapped.currentLiabilities![i]!)>2))throw new Error('Gross assets or net-current reconciliation failed');
  }
  const confirmation=HistoricalConfirmSchema.parse({securityId,statementType:type,unitsVerified:true,periods:[2017,2016].map((year,columnIndex)=>({columnIndex,period:{periodType:'annual',fiscalYear:year,periodEnd:`${year}-12-31`,reportedAt:'2018-03-22',currency:'KES'},[type]:Object.fromEntries(Object.entries(mapped).map(([field,values])=>[field,values[columnIndex]!*(field==='eps'?1:1000)])),sourcePage:1,note:`${KAKUZI_GROUP_VERSION}: audited group comparative columns; unscaled EPS. Gross current assets include separately presented cash; gross total assets and liabilities reconstructed from the net-assets presentation and reconciled against equity. No cash flow is reported.`}))});
  entries.push({table:{title:type,headerLine:'31 December 2017 / 31 December 2016',rows,method:KAKUZI_GROUP_VERSION,confidence:1},confirmation});
 }
 return entries;
}
