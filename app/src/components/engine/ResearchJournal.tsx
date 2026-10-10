import { useEffect, useState } from "react";

const checks = [
  "Check the reporting period",
  "Compare valuation assumptions",
  "Review debt and cash flow",
  "Read company-linked news",
  "Review portfolio concentration",
];
interface Entry {
  notes: string;
  checked: string[];
  updatedAt: string | null;
  reviewDate: string;
  thesisStatus: string;
  invalidation: string;
  revisions: {at:string;notes:string;invalidation:string}[];
  evidence: string;
  counterEvidence: string;
  nextAction: string;
}
const empty: Entry = {
  notes: "",
  checked: [],
  updatedAt: null,
  reviewDate: "",
  thesisStatus: "Researching",
  invalidation: "",
  revisions: [],
  evidence: "",
  counterEvidence: "",
  nextAction: "",
};

/** Account and exchange isolation prevents notes leaking into another workspace. */
export function ResearchJournal({
  account,
  exchange,
  symbol,
}: {
  account: string;
  exchange: string;
  symbol: string;
}) {
  return (
    <Journal
      key={`${account}:${exchange}:${symbol}`}
      storageKey={`continua:journal:v1:${account}:${exchange}:${symbol}`}
      symbol={symbol}
    />
  );
}
function Journal({
  storageKey,
  symbol,
}: {
  storageKey: string;
  symbol: string;
}) {
  const [entry, setEntry] = useState<Entry>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (typeof value?.notes === "string" && Array.isArray(value.checked))
        return {
          ...empty,
          counterEvidence:typeof value.counterEvidence==="string"?value.counterEvidence.slice(0,2000):"",
          nextAction:typeof value.nextAction==="string"?value.nextAction.slice(0,1000):"",
          evidence:typeof value.evidence==="string"?value.evidence.slice(0,3000):"",
          revisions:Array.isArray(value.revisions)?value.revisions.filter((r:Entry["revisions"][number])=>typeof r?.at==="string"&&typeof r.notes==="string"&&typeof r.invalidation==="string").slice(0,5).map((r:Entry["revisions"][number])=>({at:r.at,notes:r.notes.slice(0,5000),invalidation:r.invalidation.slice(0,1000)})):[],
          notes: value.notes.slice(0, 5000),
          checked: value.checked.filter((v: string) => checks.includes(v)),
          updatedAt:
            typeof value.updatedAt === "string" ? value.updatedAt : null,
          reviewDate:
            typeof value.reviewDate === "string" ? value.reviewDate : "",
          thesisStatus: [
            "Researching",
            "Monitoring",
            "Review needed",
            "Archived",
          ].includes(value.thesisStatus)
            ? value.thesisStatus
            : "Researching",
          invalidation:
            typeof value.invalidation === "string"
              ? value.invalidation.slice(0, 1000)
              : "",
        };
    } catch {
      /* Optional device storage. */
    }
    return empty;
  });
  const [status, setStatus] = useState("");
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(entry));
      setStatus(entry.updatedAt ? "Saved on this device" : "");
    } catch {
      setStatus(
        "Device storage is unavailable. Keep a copy before leaving this page.",
      );
    }
  }, [storageKey, entry]);
  const update = (changes: Partial<Entry>) => {
    setStatus("Saving…");
    setEntry((current) => ({
      ...current,
      ...changes,
      updatedAt: new Date().toISOString(),
    }));
  };
  return (
    <section className="space-y-5" aria-label="Research journal">
      <div>
        <h3 className="text-xl font-semibold">
          Your {symbol} research journal
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Capture your reasoning and the evidence you still need. Private,
          device-only notes—not an Engine recommendation.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 border-y border-border py-3">
        <label className="text-xs">
          Thesis status
          <select
            aria-label="Thesis status"
            className="block mt-1 border border-border bg-background rounded-full px-3 py-2"
            value={entry.thesisStatus}
            onChange={(e) => update({ thesisStatus: e.target.value })}
          >
            {["Researching", "Monitoring", "Review needed", "Archived"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
        <label className="text-xs">
          Next review
          <input
            type="date"
            aria-label="Next research review"
            className="block mt-1 border border-border bg-background rounded-full px-3 py-2"
            value={entry.reviewDate}
            onChange={(e) => update({ reviewDate: e.target.value })}
          />
        </label>
      </div>
      {entry.reviewDate && entry.reviewDate <= localToday && (
        <p className="text-xs text-primary">
          Your scheduled research review is due. Revisit the latest filing,
          assumptions and company news.
        </p>
      )}
      <label className="block text-sm">
        What would invalidate your thesis?
        <textarea
          aria-label="Thesis invalidation conditions"
          className="block w-full mt-2 border border-border bg-background p-3 text-sm min-h-24"
          maxLength={1000}
          value={entry.invalidation}
          onChange={(e) => update({ invalidation: e.target.value })}
          placeholder="For example: a sustained change in cash conversion or an unverified valuation assumption."
        />
      </label>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">
          Research checklist · {entry.checked.length}/{checks.length}
        </legend>
        {checks.map((check) => (
          <label key={check} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={entry.checked.includes(check)}
              onChange={(e) =>
                update({
                  checked: e.target.checked
                    ? [...entry.checked, check]
                    : entry.checked.filter((v) => v !== check),
                })
              }
              className="h-4 w-4 accent-primary"
            />
            {check}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm font-semibold">
        Thesis, risks and questions
        <textarea
          aria-label="Research notes"
          value={entry.notes}
          onChange={(e) => update({ notes: e.target.value })}
          maxLength={5000}
          placeholder="What evidence supports your thesis? What would change your mind?"
          className="mt-2 min-h-48 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm font-normal leading-relaxed"
        />
      </label>
      <button type="button" className="border border-border rounded-lg px-3 py-2 text-sm" disabled={entry.notes.length>4500} onClick={()=>update({notes:[entry.notes,"Hypothesis:\n\nReported evidence:\n\nAssumptions (not facts):\n\nAlternative explanation:\n\nNext filing or disclosure to check:"].filter(Boolean).join("\n\n").slice(0,5000)})}>Append research template</button>
      <label className="block text-sm">Strongest counter-evidence<textarea aria-label="Journal counter-evidence" maxLength={2000} value={entry.counterEvidence} onChange={e=>update({counterEvidence:e.target.value})} placeholder="Which dated fact challenges your thesis? What alternative explanation fits?" className="block mt-2 w-full border border-border bg-background p-3 min-h-24 text-sm"/></label>
      <label className="block text-sm">Next evidence to collect<textarea aria-label="Journal next evidence" maxLength={1000} value={entry.nextAction} onChange={e=>update({nextAction:e.target.value})} placeholder="Source, reporting period and question to resolve before your next review" className="block mt-2 w-full border border-border bg-background p-3 min-h-20 text-sm"/></label>
      <p className="text-xs text-muted-foreground">Research structure: {[entry.notes.trim(),entry.evidence.trim(),entry.counterEvidence.trim(),entry.invalidation.trim(),entry.nextAction.trim()].filter(Boolean).length}/5 fields recorded. Completeness is not investment conviction or data quality.</p>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <p role="status">{status}</p>
        <span>{entry.notes.length}/5000</span>
      </div>
      <label className="block text-sm">Evidence log<textarea aria-label="Journal evidence log" maxLength={3000} value={entry.evidence} onChange={e=>update({evidence:e.target.value})} placeholder="Date · filing or article URL · what it supports or contradicts" className="block mt-1 w-full border border-border bg-background p-2 min-h-24 text-sm"/></label>
      <div className="flex flex-wrap gap-2 text-xs">
        <button className="border border-border px-3 py-2" onClick={()=>update({revisions:[{at:new Date().toISOString(),notes:entry.notes,invalidation:entry.invalidation},...entry.revisions].slice(0,5)})}>Save thesis snapshot</button>
        <button className="border border-border px-3 py-2" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({symbol,...entry},null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`${symbol}-research-journal.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export journal</button>
      </div>
      {entry.revisions.map((r,index)=><details key={r.at+index} className="border-t border-border py-2 text-xs"><summary>Thesis snapshot · {new Date(r.at).toLocaleString()}</summary><p className="whitespace-pre-wrap mt-2">{r.notes||"No notes"}</p><p className="mt-1">Invalidation: {r.invalidation||"Not recorded"}</p></details>)}
      <p className="text-xs text-muted-foreground">
        Notes are separate for each account and stock, do not sync across
        devices, and can be lost if browser storage is cleared. They never alter
        the underlying financial data.
      </p>
    </section>
  );
}
