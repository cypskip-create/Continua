import * as cheerio from 'cheerio';
export function publisherNumber(raw:string):{value:number|null;unit:string|null;approximate:boolean}{
 const stripped=raw.replace(/[▲▼↑↓,]/g,'').trim();
 const negative=stripped.startsWith('(')&&stripped.endsWith(')');
 const clean=negative?stripped.slice(1,-1).trim():stripped;
 const match=/^(?:KES\s*)?(\(?-?\d+(?:\.\d+)?\)?)\s*([KMBT%])?$/i.exec(clean);
 if(!match)return {value:null,unit:null,approximate:false};
 const value=Number(match[1]!.replace(/[()]/g,''))*(negative||match[1]!.startsWith('(')?-1:1),suffix=match[2]?.toUpperCase();
 return {value:value*({K:1e3,M:1e6,B:1e9,T:1e12}[suffix??'']??1),unit:suffix==='%'?'percent':/KES/i.test(raw)?'KES':suffix??null,approximate:!!suffix&&suffix!=='%'};
}
export function publisherDate(raw:string):string|null{
 const text=raw.trim();let date:string;
 const short=/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(text);
 if(short)date=`${short[3]!.length===2?'20':''}${short[3]}-${short[2]}-${short[1]}`;
 else {const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];const long=/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/.exec(text);if(!long)return null;const month=months.findIndex(m=>long[2]!.toLowerCase().startsWith(m.toLowerCase()));if(month<0)return null;date=`${long[3]}-${String(month+1).padStart(2,'0')}-${long[1]!.padStart(2,'0')}`;}
 const d=new Date(date+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date?date:null;
}
/** All columns, including horizontally off-screen years, retain original labels.
 * These are publisher observations, not an approved issuer statement. */
export function extractStockTables(html:string,tab:string,category:string|null){
 const $=cheerio.load(html);$('.date-cell-sm').remove();
 const tables:unknown[]=[];
 $('table').each((index,table)=>{
  const rows=$(table).find('tr').map((_,tr)=>[$(tr).children('th,td').map((_,cell)=>$(cell).text().replace(/\s+/g,' ').trim()).get()]).get() as string[][];
  if(!rows.length)return;const columns=rows.shift()!;
  if(columns.map(v=>v.toLowerCase()).join('|')==='date|open|low|high|close|volume'){
   const observations=rows.map(c=>{const date=publisherDate(c[0]??''),numbers=c.slice(1).map(publisherNumber);const [open,low,high,close,volume]=numbers.map(n=>n.value);
    const valid=!!date&&date>='2015-01-01'&&Date.parse(date)<=Date.now()&&[open,low,high,close].every(n=>n!=null&&n>0)&&volume!=null&&Number.isInteger(volume)&&volume>=0&&high!>=Math.max(open!,low!,close!)&&low!<=Math.min(open!,close!);
    return {date,open,low,high,close,volume,volumeRaw:c[5],volumeApproximate:numbers[4]?.approximate??false,valid,raw:c};});
   tables.push({kind:'publisher_ohlcv',tab,columns,observations,adjustment:'unknown',confidence:.7});
  }else {
   let group:string|null=null;
   const elements=$(table).find('tr').toArray().slice(1);
   tables.push({kind:'publisher_table',tab,category,index,columns,rows:rows.map((c,i)=>{
    const grouped=elements[i]&&$(elements[i]!).hasClass('group-header-row');
    if(grouped)group=c[0]??null;
    return {label:c[0],rowKind:grouped?'group':/^total\b/i.test(c[0]??'')?'total':'item',group,cells:c.slice(1).map(raw=>({raw,...publisherNumber(raw)}))};
   }),confidence:.6});
  }
 });return tables;
}
