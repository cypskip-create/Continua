import type { DetectedFinancialTable } from '../../types/market.js';
import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';

export const CONDENSED_GROUP_VERSION = 'safaricom-condensed-group-v1';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function iso(day:string, month:string, year:string) {
  const index=months.findIndex(m=>month.toLowerCase().startsWith(m.toLowerCase()));
  const value=`${year}-${String(index+1).padStart(2,'0')}-${day.padStart(2,'0')}`;
  if(index<0 || new Date(value).toISOString().slice(0,10)!==value)throw new Error('Invalid financial date');
  return value;
}
function numeric(cell:string) {
  if(!/^(?:\(\d[\d,]*(?:\.\d+)?\)|-?\d[\d,]*(?:\.\d+)?)$/.test(cell))throw new Error('Incomplete financial cell');
  return Number(cell.replace(/[(),]/g,''))*(cell.startsWith('(')?-1:1);
}
/** Verified one-page Safaricom audited layout. Group columns precede company
 * columns; never mix the two. Both dated comparative columns are retained.
 * This is a template validator, not permission to publish arbitrary OCR. */
export function validateCondensedGroupReport(text:string, issuer:string, securityId:string) {
  if(securityId!=='NSE:SCOM' || issuer.toLowerCase().replace(/[^a-z]/g,'')!=='safaricomplc' || !/^\s*SAFARICOM\s+PLC\s+CONDENSED AUDITED RESULTS FOR THE\s*$/im.test(text))throw new Error('Exact condensed issuer identity required');
  const approval=[...text.matchAll(/approved by the Board of Directors on (\d{1,2}) (\w+) (20\d{2})/g)];
  if(approval.length!==1)throw new Error('Unique board approval required');
  const reportedAt=iso(approval[0]![1]!,approval[0]![2]!,approval[0]![3]!);
  const headings=[...text.matchAll(/Condensed consolidated statement\s+of\s+(profit or[\s\S]{0,90}?ended:|financial position as at:|cash flows for the year ended:)/gi)];
  if(headings.length!==3)throw new Error('All three audited group statements required');
  const entries:{table:DetectedFinancialTable;confirmation:ReturnType<typeof HistoricalConfirmSchema.parse>}[]=[];
  for(let index=0;index<headings.length;index++) {
    const heading=headings[index]!;
    const block=text.slice(heading.index!,headings[index+1]?.index??text.length);
    const scope=block.match(/Group \(KShs Mn\)\s+Company \(KShs Mn\)/);
    if(!scope)throw new Error('Explicit group/company KES million column order required');
    const header=block.match(/(\d{1,2})-(\w{3})-(\d{2})\s+(\d{1,2})-(\w{3})-(\d{2})\s+(\d{1,2})-(\w{3})-(\d{2})\s+(\d{1,2})-(\w{3})-(\d{2})/);
    if(!header)throw new Error('Four dated group/company columns required');
    const ends=[0,1,2,3].map(i=>iso(header[i*3+1]!,header[i*3+2]!,`20${header[i*3+3]}`));
    if(ends[0]!==ends[2] || ends[1]!==ends[3] || ends[0]!.slice(5)!==ends[1]!.slice(5) || Number(ends[0]!.slice(0,4))-Number(ends[1]!.slice(0,4))!==1)throw new Error('Comparative dates or column scopes disagree');
    const rows:DetectedFinancialTable['rows']=[];
    for(const line of block.split(/\r?\n/)) {
      const cells=line.trim().split(/\t+|\s{2,}/).map(v=>v.trim());
      if(cells.length===5 && cells.slice(1).every(v=>/^(?:\(?-?\d[\d,]*(?:\.\d+)?\)?)$/.test(v)))rows.push({label:cells[0]!,values:cells.slice(1)});
    }
    const find=(label:RegExp)=>{
      const matches=rows.filter(row=>label.test(row.label));
      if(!matches.length || matches.some(row=>row.values.join('|')!==matches[0]!.values.join('|')))throw new Error(`Missing or conflicting accounting row: ${label.source}`);
      return matches[0]!.values.slice(0,2).map(numeric);
    };
    const type=heading[1]!.startsWith('financial')?'balance':heading[1]!.startsWith('cash')?'cashflow':'income';
    const mapped:Record<string,number[]>={};
    if(type==='income') {
      mapped.revenue=find(/^Total Revenue$/i);mapped.netIncome=find(/^Profit for the year$/i);
      mapped.eps=find(/^Basic and diluted earnings per share \(EPS\)$/i);
      // Conservative template range: an unusual per-share result goes to
      // review rather than silently accepting a lost decimal separator.
      if(mapped.eps.some(value=>Math.abs(value)>20))throw new Error('Unusual per-share scale requires review');
      const before=find(/^Profit before income tax$/i),tax=find(/^Income tax expense$/i);
      for(let i=0;i<2;i++)if(mapped.revenue[i]!<=0 || Math.abs(before[i]!-Math.abs(tax[i]!)-mapped.netIncome[i]!)>0.3)throw new Error('Income reconciliation failed');
      mapped.operatingIncome=find(/^Operating profit \(EBIT\)$/i);
    } else if(type==='balance') {
      mapped.totalAssets=find(/^Total assets$/i);mapped.totalEquity=find(/^Total equity$/i);mapped.totalLiabilities=find(/^Total liabilities$/i);
      for(let i=0;i<2;i++)if(mapped.totalAssets[i]!<=0 || Math.abs(mapped.totalAssets[i]!-mapped.totalEquity[i]!-mapped.totalLiabilities[i]!)>0.3)throw new Error('Balance reconciliation failed');
    } else {
      mapped.operatingCashFlow=find(/^Net cash generated from operating activities$/i);
      mapped.investingCashFlow=find(/^Net cash used in investing activities$/i);
      mapped.financingCashFlow=find(/^Net cash used in financing activities$/i);
      const change=find(/^\(Decrease\)\/Increase in cash and cash equivalents$/i);
      for(let i=0;i<2;i++)if(Math.abs(mapped.operatingCashFlow[i]!+mapped.investingCashFlow[i]!+mapped.financingCashFlow[i]!-change[i]!)>0.3)throw new Error('Cash-flow reconciliation failed');
    }
    const confirmation=HistoricalConfirmSchema.parse({securityId,statementType:type,unitsVerified:true,periods:ends.slice(0,2).map((periodEnd,columnIndex)=>({
      columnIndex,period:{periodType:'annual',fiscalYear:Number(periodEnd.slice(0,4)),periodEnd,reportedAt,currency:'KES'},
      [type]:Object.fromEntries(Object.entries(mapped).map(([field,values])=>[field,values[columnIndex]!*(field==='eps'?1:1e6)])),
      sourcePage:1,note:`Automatic ${CONDENSED_GROUP_VERSION}: verified audited group columns, KES million units, dated comparatives and reconciled statements. EPS unscaled; group net income includes non-controlling interests.`,
    }))});
    entries.push({table:{title:heading[0]!,headerLine:header[0],rows,method:CONDENSED_GROUP_VERSION,confidence:1},confirmation});
  }
  return entries;
}
