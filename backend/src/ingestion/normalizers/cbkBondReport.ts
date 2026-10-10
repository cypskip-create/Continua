import { MarketResearchRecordSchema } from "./marketResearchRecord.js";

const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const shortMonths = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function isoDate(day:string, month:number, year:number) {
  const value=`${year}-${String(month+1).padStart(2,"0")}-${day.padStart(2,"0")}`;
  const parsed=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw new Error("Invalid source date");
  return `${value}T00:00:00Z`;
}
/** Strict DRAFT extraction for the documented CBK reopened-bond layout.
 * Missing or misaligned columns require manual review, never positional guessing.
 * The signed report date is not silently relabelled as the auction date.
 */
export function draftCbkBondReport(text:string, sourceUrl:string) {
  const host=new URL(sourceUrl).hostname;
  if(host!=="centralbank.go.ke" && host!=="www.centralbank.go.ke") throw new Error("Expected official CBK source");
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  const issueLine=lines.find(line=>/^ISSUE NUMBER\s/i.test(line));
  const issues=issueLine?.match(/(?:FXD\d|IFB\d|SDB\d)[/-]\d{4}[/-]\d{1,3}(?:\.\d+)?/g) ?? [];
  if(!issues.length || new Set(issues).size!==issues.length) throw new Error("Issue columns need review");
  const reportDates=[...text.matchAll(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)];
  const signed=reportDates.at(-1);
  if(!signed) throw new Error("Signed report date missing");
  const observedAt=isoDate(signed[1]!,months.indexOf(signed[2]!.toLowerCase()),Number(signed[3]));
  if(observedAt.slice(0,10)<"2015-01-01" || Date.parse(observedAt)>Date.now()) throw new Error("Report date outside coverage");
  const vector=(label:RegExp,required=true)=>{
    const line=lines.find(v=>label.test(v));
    if(!line) { if(required) throw new Error("Required auction row missing"); return undefined; }
    const values=line.replace(label,"").trim().split(/\s+/);
    if(values.length!==issues.length || values.some(v=>!/^\d+(?:\.\d+)?$/.test(v))) throw new Error("Auction columns are not aligned");
    return values.map(Number);
  };
  const yields=vector(/^Weighted Average Rate of Accepted Bids\s*\(%\)\s*/i)!;
  const coupons=vector(/^Coupon Rate\s*\(%\)\s*/i,false);
  const prices=vector(/^Price per Kshs\s*100 at average yield\s*/i,false);
  const isinLine=lines.find(v=>/^ISIN\s/.test(v));
  const isins=isinLine?.match(/KE[A-Z0-9]{9}\d/g) ?? [];
  if(isins.length!==issues.length) throw new Error("ISIN columns missing");
  const due=lines.find(v=>/^Due Dates\s/i.test(v))?.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/g) ?? [];
  if(due.length!==issues.length) throw new Error("Maturity columns need review");
  return issues.map((issue,index)=>{
    const parts=due[index]!.split("-"); const year=Number(parts[2]);
    const maturity=isoDate(parts[0]!,shortMonths.indexOf(parts[1]!.toLowerCase()),year<100?2000+year:year);
    const symbol=issue.replaceAll("/","-");
    const tenor=Number(issue.split(/[/-]/).at(-1));
    const record=MarketResearchRecordSchema.parse({id:`cbk:${symbol}:${observedAt.slice(0,10)}`,kind:"bond",title:symbol,symbol,observedAt,sourceUrl,
      payload:{tenor,yield:yields[index],coupon:coupons?.[index],price:prices?.[index],isin:isins[index],maturity,unit:"KES per 100 face value",yieldBasis:"accepted_auction"}});
    return record;
  });
}
