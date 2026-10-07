import { useEffect, useState } from "react";

const checks = ["Check the reporting period", "Compare valuation assumptions", "Review debt and cash flow", "Read company-linked news", "Review portfolio concentration"];
interface Entry { notes: string; checked: string[]; updatedAt: string | null }
const empty: Entry = { notes: "", checked: [], updatedAt: null };

/** Account and exchange isolation prevents notes leaking into another workspace. */
export function ResearchJournal({ account, exchange, symbol }: { account: string; exchange: string; symbol: string }) {
  return <Journal key={`${account}:${exchange}:${symbol}`} storageKey={`continua:journal:v1:${account}:${exchange}:${symbol}`} symbol={symbol} />;
}
function Journal({ storageKey, symbol }: { storageKey: string; symbol: string }) {
  const [entry, setEntry] = useState<Entry>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (typeof value?.notes === "string" && Array.isArray(value.checked)) return { notes: value.notes.slice(0, 5000), checked: value.checked.filter((v: string) => checks.includes(v)), updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null };
    } catch { /* Optional device storage. */ }
    return empty;
  });
  const [status, setStatus] = useState("");
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(entry)); setStatus(entry.updatedAt ? "Saved on this device" : ""); }
    catch { setStatus("Device storage is unavailable. Keep a copy before leaving this page."); }
  }, [storageKey, entry]);
  const update = (changes: Partial<Entry>) => { setStatus("Saving…"); setEntry(current => ({ ...current, ...changes, updatedAt: new Date().toISOString() })); };
  return <section className="space-y-5" aria-label="Research journal">
    <div><h3 className="text-xl font-semibold">Your {symbol} research journal</h3><p className="mt-2 text-sm text-muted-foreground">Capture your reasoning and the evidence you still need. Private, device-only notes—not an Engine recommendation.</p></div>
    <fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">Research checklist · {entry.checked.length}/{checks.length}</legend>{checks.map(check => <label key={check} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={entry.checked.includes(check)} onChange={e => update({ checked: e.target.checked ? [...entry.checked, check] : entry.checked.filter(v => v !== check) })} className="h-4 w-4 accent-primary" />{check}</label>)}</fieldset>
    <label className="block text-sm font-semibold">Thesis, risks and questions<textarea aria-label="Research notes" value={entry.notes} onChange={e => update({ notes: e.target.value })} maxLength={5000} placeholder="What evidence supports your thesis? What would change your mind?" className="mt-2 min-h-48 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm font-normal leading-relaxed" /></label>
    <div className="flex justify-between gap-3 text-xs text-muted-foreground"><p role="status">{status}</p><span>{entry.notes.length}/5000</span></div>
    <p className="text-xs text-muted-foreground">Notes are separate for each account and stock, do not sync across devices, and can be lost if browser storage is cleared. They never alter the underlying financial data.</p>
  </section>;
}
