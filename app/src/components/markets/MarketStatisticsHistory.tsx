import { useState } from "react";
import type { ResearchRecord } from "@/api/marketResearchApi";
import { ResearchChart } from "./ResearchChart";
export function MarketStatisticsHistory({ records }: { records: ResearchRecord[] }) {
  const [selection, setSelection] = useState("");
  const indicators = [...new Set(records.map(r => r.payload.indicator).filter((s): s is string => !!s))];
  const selected = indicators.includes(selection) ? selection : indicators[0];
  const history = records.filter(r => r.payload.indicator === selected).sort((a,b) => a.observedAt.localeCompare(b.observedAt));
  const latest = history.at(-1);
  if (!latest) return null;
  return <section className="market-section"><h2 className="text-xl font-semibold">Historical market statistics</h2>
    <label className="block my-3">Indicator <select className="bg-background border rounded p-2 ml-2" value={selected} onChange={e => setSelection(e.target.value)}>{indicators.map(i => <option key={i}>{i}</option>)}</select></label>
    <p>{latest.payload.actual?.toLocaleString()} {latest.payload.unit} · {new Date(latest.observedAt).toLocaleDateString("en-KE")}</p>
    {latest.payload.change != null && <p className="text-sm text-muted-foreground">Reported change: {latest.payload.change > 0 ? "+" : ""}{latest.payload.change} {latest.payload.unit}</p>}
    <ResearchChart data={history.filter(r => r.payload.unit === latest.payload.unit && r.payload.actual != null).map(r => ({ date: r.observedAt.slice(0,10), value: r.payload.actual! }))} lines={[{key:"value",label:`${selected} (${latest.payload.unit})`,color:"hsl(var(--primary))"}]} />
    <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm">Official source ↗</a>
  </section>;
}
