import { useState } from "react";
import type { ResearchRecord } from "@/api/marketResearchApi";
import { bondHistory, bondHistoryKey } from "@/lib/bondHistory";
import { ResearchChart } from "./ResearchChart";
export function BondHistory({records}:{records:ResearchRecord[]}) {
  const [selected,setSelected]=useState("");
  const [metric,setMetric]=useState<"yield"|"price">("yield");
  const keys=[...new Set(records.filter(r=>r.kind==="bond").map(bondHistoryKey))];
  const key=keys.includes(selected)?selected:keys[0];
  const rows=key?bondHistory(records,key):[];
  const latest=rows.at(-1);
  if(!latest) return <p className="market-empty">Bond history will appear when source-backed observations are available.</p>;
  const basis=latest.payload.yieldBasis;
  const label=metric==="price"?"Reported price (KES per 100 face value)":basis==="accepted_auction"?"Accepted auction yield (%)":basis==="secondary_market"?"Secondary-market yield (%)":"Reported yield (%) — basis not specified";
  return <section className="mt-6 border-t pt-5">
    <h3 className="text-lg font-semibold">Bond observation history</h3>
    <p className="text-sm text-muted-foreground my-3">Follow one bond across its published reports. Auction results are not live exchange prices or a forecast.</p>
    <label className="block mb-3">Instrument <select className="border rounded p-2 bg-background max-w-full" value={key} onChange={e=>setSelected(e.target.value)}>{keys.map(k=>{const r=records.find(r=>bondHistoryKey(r)===k)!;return <option key={k} value={k}>{r.title} · {r.payload.yieldBasis==="accepted_auction"?"auction":r.payload.yieldBasis==="secondary_market"?"secondary market":"reported"}</option>;})}</select></label>
    <div className="flex gap-3 mb-4" role="group" aria-label="Bond history measure">{(["yield","price"] as const).map(v=><button key={v} className={`pill-tab ${metric===v?"contrast-active":""}`} aria-pressed={metric===v} onClick={()=>setMetric(v)}>{v==="yield"?"Yield":"Price per 100"}</button>)}</div>
    <ResearchChart data={rows.filter(r=>r.payload[metric]!=null && (metric!=="price" || r.payload.unit==="KES per 100 face value")).map(r=>({date:r.observedAt.slice(0,10),value:r.payload[metric]!}))} lines={[{key:"value",label,color:"hsl(var(--primary))"}]}/>
    <div className="overflow-auto mt-4"><table className="market-table"><thead><tr><th>Report date</th><th>Yield %</th><th>Price per KES 100</th><th>Source</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.observedAt).toLocaleDateString("en-KE")}</td><td>{r.payload.yield??"—"}</td><td>{r.payload.unit==="KES per 100 face value"?(r.payload.price??"—"):"—"}</td><td><a className="text-primary" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Source report ↗</a></td></tr>)}</tbody></table></div>
  </section>;
}
