import type { DetectedFinancialTable } from '../../types/market.js';
import { HistoricalConfirmSchema } from '../confirmHistoricalColumns.js';
import {issuerMastheadMatches} from './issuerIdentity.js';

export const NATIVE_ANNUAL_VERSION = 'consolidated-native-annual-v1';
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const datePattern='(\\d{1,2})\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(20\\d{2})';
function date(day:string,month:string,year:string) {
  const value=`${year}-${String(months.indexOf(month.toLowerCase())+1).padStart(2,'0')}-${day.padStart(2,'0')}`;
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) throw new Error('Invalid report date');
  return value;
}
function number(value:string) {
  if(!/^(?:\(\d[\d,]*(?:\.\d+)?\)|-?\d[\d,]*(?:\.\d+)?)$/.test(value)) throw new Error('Incomplete numeric cell');
  const result=Number(value.replace(/[(),]/g,''))*(value.startsWith('(')?-1:1);
  if(!Number.isFinite(result))throw new Error('Invalid numeric cell');
  return result;
}
/** A deliberately narrow native layout, not an OCR-confidence shortcut.
 * Explicit consolidated scope, dated annual heading, one aligned year header,
 * KES units, source approval date and accounting cross-checks are mandatory.
 * Company-only/group-bank mixed columns, notes columns without headers,
 * interim periods and duplicate labels fail closed into the review queue.
 */
export function validateNativeAnnualReport(text:string, issuer:string, securityId:string) {
  const normalized=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!issuer || (!issuerMastheadMatches(text,issuer)&&!normalized(text.slice(0,4000)).includes(normalized(issuer)))) throw new Error('Exact issuer identity missing from report header');
  const approvals=[...text.matchAll(new RegExp(`(?:approved|authorised)\\s+(?:by[^\\n]{0,100}\\s+)?(?:for issue\\s+)?on\\s+${datePattern}`,'gi'))];
  const reportDates=[...new Set(approvals.map(v=>date(v[1]!,v[2]!,v[3]!)))];
  if(reportDates.length!==1)throw new Error('Unique approval date required');
  const reportedAt=reportDates[0]!;
  const entries:{table:DetectedFinancialTable;confirmation:ReturnType<typeof HistoricalConfirmSchema.parse>}[]=[];
  for(const [pageIndex,page] of text.split('\f').entries()) {
    const headings=[...page.matchAll(/^(?:\s*)CONSOLIDATED STATEMENT OF (PROFIT OR LOSS|COMPREHENSIVE INCOME|FINANCIAL POSITION|CASH FLOWS)[^\n]*$/gim)];
    for(let h=0;h<headings.length;h++) {
      const heading=headings[h]!;
      const block=page.slice(heading.index!,headings[h+1]?.index??page.length);
      const lines=block.split(/\r?\n/).map(v=>v.trim());
      if(/\b(?:company|bank)\s+(?:group|20\d{2})|\b(?:quarter|six months|half.year|unaudited)\b/i.test(lines.slice(0,12).join(' '))) throw new Error('Mixed scope or interim columns require review');
      const period=block.match(new RegExp(`(?:for the year ended|as at)\\s+${datePattern}`,'i'));
      if(!period) throw new Error('Exact annual end date required');
      const unitLines=lines.slice(0,12).filter(v=>/\b(?:KES|KShs?\.?|Shs\.?)\s*(?:['’]?000|million|billion)\b/i.test(v));
      const units=[...new Set(unitLines.map(v=>v.match(/\b(?:KES|KShs?\.?|Shs\.?)\s*(['’]?000|million|billion)\b/i)![1]!.replace(/['’]/g,'').toLowerCase()))];
      if(units.length!==1 || /\b(?:USD|US\$|UGX|TZS|GBP)\b/.test(lines.slice(0,12).join(' ')))throw new Error('Unique KES units required');
      const multiplier=units[0]==='000'?1000:units[0]==='million'?1e6:1e9;
      const headers=lines.filter(v=>/^(?:Notes?\s+)?20\d{2}(?:\s+20\d{2}){0,3}$/.test(v));
      if(headers.length!==1)throw new Error('Aligned single year header required');
      const header=headers[0]!,hasNotes=/^Notes?\s/.test(header);
      const years=header.match(/20\d{2}/g)!;
      if(years[0]!==period[3] || new Set(years).size!==years.length || years.some(y=>Number(y)<2015 || Number(y)>Number(period[3])))throw new Error('Annual columns do not match the dated heading');
      const rows:DetectedFinancialTable['rows']=[];
      for(const line of lines) {
        const cells=line.split(/\s{2,}/);
        if(cells.length<2 || !/[a-z]/i.test(cells[0]!)) continue;
        let values=cells.slice(1);
        if(hasNotes && values.length===years.length+1 && /^\d{1,3}$/.test(values[0]!))values=values.slice(1);
        if(values.length!==years.length)continue;
        if(values.every(v=>/^(?:\(?-?\d[\d,]*(?:\.\d+)?\)?)$/.test(v)))rows.push({label:cells[0]!,values});
      }
      const find=(labels:RegExp)=>{
        const matches=rows.filter(r=>labels.test(r.label));
        if(matches.length!==1)throw new Error('Missing or duplicate accounting label');
        return matches[0]!.values.map(number);
      };
      const type=heading[1]!.toUpperCase()==='FINANCIAL POSITION'?'balance':heading[1]!.toUpperCase()==='CASH FLOWS'?'cashflow':'income';
      const mapped:Record<string,number[]>={};
      if(type==='balance') {
        mapped.totalAssets=find(/^Total assets$/i);mapped.totalLiabilities=find(/^Total liabilities$/i);mapped.totalEquity=find(/^Total (?:equity|shareholders['’]? funds)$/i);
        for(let i=0;i<years.length;i++) if(mapped.totalAssets[i]!<=0 || Math.abs(mapped.totalAssets[i]!-mapped.totalLiabilities[i]!-mapped.totalEquity[i]!)>3)throw new Error('Balance totals fail rounding-level check');
      } else if(type==='income') {
        mapped.revenue=find(/^(?:Revenue|Total operating income)$/i);mapped.netIncome=find(/^(?:Profit|Loss|Profit\/\(loss\)) (?:after tax|for the year)$/i);
        // Per-share unit must be explicit: never scale EPS by a table multiplier.
        mapped.eps=find(/^(?:Basic )?Earnings per share \((?:KES|KShs?\.?)\)$/i);
        const before=find(/^Profit before tax$/i),tax=find(/^Income tax expense$/i);
        for(let i=0;i<years.length;i++)if(mapped.revenue[i]!<=0 || Math.abs(before[i]!-Math.abs(tax[i]!)-mapped.netIncome[i]!)>3)throw new Error('Income tax reconciliation failed');
      } else {
        mapped.operatingCashFlow=find(/^Net cash (?:generated from|used in|from) operating activities$/i);
        mapped.investingCashFlow=find(/^Net cash (?:generated from|used in|from) investing activities$/i);
        mapped.financingCashFlow=find(/^Net cash (?:generated from|used in|from) financing activities$/i);
        const change=find(/^Net (?:increase|decrease|increase\/\(decrease\)) in cash and cash equivalents$/i);
        for(let i=0;i<years.length;i++)if(Math.abs(mapped.operatingCashFlow[i]!+mapped.investingCashFlow[i]!+mapped.financingCashFlow[i]!-change[i]!)>3)throw new Error('Cash-flow reconciliation failed');
      }
      const confirmation=HistoricalConfirmSchema.parse({securityId,statementType:type,unitsVerified:true,periods:years.map((year,columnIndex)=>({
        columnIndex,period:{periodType:'annual',fiscalYear:Number(year),periodEnd:date(period[1]!,period[2]!,year),reportedAt,currency:'KES'},
        [type]:Object.fromEntries(Object.entries(mapped).map(([field,values])=>[field,values[columnIndex]!*(field==='eps'?1:multiplier)])),
        sourcePage:pageIndex+1,note:`Automatic ${NATIVE_ANNUAL_VERSION}: exact issuer, consolidated annual scope, dated columns, KES ${units[0]}, approval date and accounting reconciliation. EPS is unscaled.`,
      }))});
      entries.push({table:{title:heading[0]!.trim(),headerLine:header,rows,method:NATIVE_ANNUAL_VERSION,confidence:1},confirmation});
    }
  }
  if(!entries.length)throw new Error('Unsupported native financial layout');
  const periods=entries.flatMap(e=>e.confirmation.periods.map(p=>`${e.confirmation.statementType}:${p.period.fiscalYear}`));
  if(new Set(periods).size!==periods.length)throw new Error('Duplicate statements require review');
  return entries;
}
