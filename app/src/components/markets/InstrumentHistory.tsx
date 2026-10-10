import { useMemo, useState } from "react";
import type { ResearchRecord } from "@/api/marketResearchApi";
import { ResearchChart } from "./ResearchChart";

export function InstrumentHistory({ records, kind, loading, failed }: { records: ResearchRecord[]; kind: "Derivatives" | "USP"; loading: boolean; failed: boolean }) {
  const [selected, setSelected] = useState("");
  const instruments = useMemo(() => [...new Set(records.map(r => r.payload.isin ?? r.symbol ?? r.title))], [records]);
  const instrument = instruments.includes(selected) ? selected : instruments[0];
  const history = records.filter(r => (r.payload.isin ?? r.symbol ?? r.title) === instrument).sort((a,b) => a.observedAt.localeCompare(b.observedAt));
  const latest = history.at(-1);
  return <section className="market-section">
    <h2 className="text-xl font-semibold">{kind === "USP" ? "Unquoted Securities Platform" : "NSE derivatives"}</h2>
    <p className="text-sm text-muted-foreground my-3">{kind === "USP" ? "Unquoted securities are separate from listed shares. Prices are shown for the publisher’s observation date, not as live quotes." : "Settlement prices, contract expiry, trading volume and open interest. These are futures contracts, not company shares."}</p>
    {loading ? <p>Loading observations…</p> : failed ? <p>Observations are temporarily unavailable. Please try refreshing.</p> : !latest ? <p>No verified historical observations available yet. This view will populate after an authorised data source is connected.</p> : <>
      <label className="block my-4">Instrument <select className="border rounded p-2 ml-2 bg-background max-w-full" value={instrument} onChange={e => setSelected(e.target.value)}>{instruments.map(id => <option key={id} value={id}>{records.find(r => (r.payload.isin ?? r.symbol ?? r.title) === id)?.title}</option>)}</select></label>
      <p className="font-medium">{latest.title} · KES {latest.payload.price?.toLocaleString()}</p>
      <p className="text-sm text-muted-foreground">Observed {new Date(latest.observedAt).toLocaleDateString("en-KE")}{latest.payload.expiry ? ` · Expires ${new Date(latest.payload.expiry).toLocaleDateString("en-KE")}` : ""}</p>
      <p className="my-3">Volume: {latest.payload.volume?.toLocaleString() ?? "Not reported"} · Open interest: {latest.payload.openInterest?.toLocaleString() ?? "Not reported"}</p>
      <ResearchChart data={history.filter(r => r.payload.price != null).map(r => ({ date: r.observedAt.slice(0,10), price: r.payload.price! }))} lines={[{ key: "price", label: "Reported price (KES)", color: "hsl(var(--primary))" }]} />
      <div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Date</th><th>Reported price (KES)</th><th>Volume</th></tr></thead><tbody>{history.map(r => <tr key={r.id}><td>{new Date(r.observedAt).toLocaleDateString("en-KE")}</td><td className="text-center">{r.payload.price}</td><td className="text-center">{r.payload.volume ?? "—"}</td></tr>)}</tbody></table></div>
      <a className="inline-block text-primary mt-4" href={latest.sourceUrl} target="_blank" rel="noopener noreferrer">Official source ↗</a>
    </>}
  </section>;
}
