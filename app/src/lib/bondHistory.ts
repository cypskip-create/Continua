import type { ResearchRecord } from "../api/marketResearchApi";
export function bondHistoryKey(record:ResearchRecord) {
  return `${record.payload.isin ?? record.symbol ?? record.title}:${record.payload.yieldBasis ?? "unspecified"}`;
}
/** Never join different instruments or auction/secondary-market yield bases. */
export function bondHistory(records:ResearchRecord[], key:string) {
  return records.filter(r=>r.kind==="bond" && bondHistoryKey(r)===key)
    .sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
}
