import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getAdminKey, setAdminKey, clearAdminKey } from "@/api/adminClient";
import { adminFinancialsApi, type ConfirmPayload } from "@/api/adminFinancialsApi";
import type { FinancialStatementCandidate } from "@/api/types";
import { ContinuaApiError } from "@/api/client";
import { ExternalLink, ShieldCheck, LogOut } from "lucide-react";

/**
 * Browser-based replacement for `npm run financials:review` /
 * `financials:draft` / `financials:confirm` / `financials:reject` — same
 * rules, same backend writes (see adminFinancials.controller.ts), just
 * reachable without shell access. Not linked from anywhere in the app's
 * nav; reach it directly at /admin/financials-review.
 *
 * Nothing here guesses a number that gets written — the "draft" pre-fill
 * (statement type + field mapping) is exactly the same best-effort
 * suggestion the CLI's financials:draft produces, editable before you hit
 * Confirm. See financialsDraft.ts on the backend for what is and isn't a
 * guess.
 */

function AdminKeyGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-sm font-bold">Financials Review</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the ADMIN_API_KEY you set in Render's Environment tab for the backend service. Kept only in this tab's session storage — cleared when you close it.
          </p>
          <Input
            type="password"
            placeholder="Admin key"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && value) { setAdminKey(value); onUnlocked(); } }}
          />
          <Button className="w-full" disabled={!value} onClick={() => { setAdminKey(value); onUnlocked(); }}>
            Unlock
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const STATEMENT_FIELDS: Record<"income" | "balance" | "cashflow", string[]> = {
  income: ["revenue", "costOfRevenue", "grossProfit", "operatingExpenses", "operatingIncome", "netIncome", "eps", "dilutedEps", "ebitda"],
  balance: ["totalAssets", "totalLiabilities", "totalEquity", "cash", "totalDebt", "currentAssets", "currentLiabilities", "sharesOutstanding"],
  cashflow: ["operatingCashFlow", "investingCashFlow", "financingCashFlow", "freeCashFlow", "capex"],
};
const REQUIRED_FIELDS: Record<"income" | "balance" | "cashflow", string[]> = {
  income: ["revenue", "netIncome", "eps"],
  balance: ["totalAssets", "totalLiabilities", "totalEquity"],
  cashflow: [],
};

function CandidateReviewForm({ candidateId, onDone }: { candidateId: string; onDone: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "candidate", candidateId],
    queryFn: () => adminFinancialsApi.getOne(candidateId),
  });
  const [statementType, setStatementType] = useState<"income" | "balance" | "cashflow">("income");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [securityId, setSecurityId] = useState("");
  const [periodType, setPeriodType] = useState<"annual" | "quarterly">("annual");
  const [fiscalYear, setFiscalYear] = useState("");
  const [fiscalQuarter, setFiscalQuarter] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reportedAt, setReportedAt] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [note, setNote] = useState("");
  const [securities, setSecurities] = useState<{ id: string; symbol: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setStatementType(data.draft.statementType);
    const initialFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.draft.mapped)) {
      if (v !== null) initialFields[k] = String(v);
    }
    setFields(initialFields);
    if (data.draft.fiscalYear) setFiscalYear(String(data.draft.fiscalYear));
    if (data.data.securityId) setSecurityId(data.data.securityId);
  }, [data]);

  useEffect(() => {
    adminFinancialsApi.listSecurities("NSE").then(setSecurities).catch(() => {});
  }, []);

  if (isLoading) return <p className="text-xs text-muted-foreground p-4">Loading candidate…</p>;
  if (error || !data) return <p className="text-xs text-destructive p-4">Failed to load candidate.</p>;

  const candidate = data.data;
  const requiredMissing = REQUIRED_FIELDS[statementType].filter((f) => !fields[f]);
  const canSubmit = !!securityId && !!fiscalYear && !!periodEnd && !!reportedAt && !!currency && requiredMissing.length === 0;

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const statementBlock: Record<string, number> = {};
      for (const f of STATEMENT_FIELDS[statementType]) {
        if (fields[f]) statementBlock[f] = Number(fields[f]);
      }
      const payload: ConfirmPayload = {
        securityId,
        statementType,
        period: {
          periodType,
          fiscalYear: Number(fiscalYear),
          fiscalQuarter: periodType === "quarterly" && fiscalQuarter ? Number(fiscalQuarter) : null,
          periodEnd,
          reportedAt,
          currency,
        },
        [statementType]: statementBlock,
        note: note || undefined,
      } as ConfirmPayload;
      const result = await adminFinancialsApi.confirm(candidateId, payload);
      if (result.warning) setSubmitError(result.warning); // still succeeded — shown as a warning, not blocking
      onDone();
    } catch (err) {
      setSubmitError(err instanceof ContinuaApiError ? err.message : "Failed to confirm.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reject() {
    setSubmitting(true);
    try {
      await adminFinancialsApi.reject(candidateId, note || undefined);
      onDone();
    } catch (err) {
      setSubmitError(err instanceof ContinuaApiError ? err.message : "Failed to reject.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold">{candidate.documentTitle ?? "Untitled document"}</p>
            <p className="text-[10px] text-muted-foreground">
              {candidate.rawCompanyName ?? "Unresolved company"} · confidence {candidate.detectionConfidence ?? "n/a"}
            </p>
          </div>
          <a href={candidate.documentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-1 shrink-0">
            Source <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Detected table</p>
          <div className="border rounded-lg overflow-hidden text-[11px]">
            {candidate.detectedTable.rows.map((row, i) => (
              <div key={i} className="flex justify-between px-2 py-1 odd:bg-muted/30">
                <span className="truncate pr-2">{row.label}</span>
                <span className="text-muted-foreground shrink-0">{row.values.join("  ")}</span>
              </div>
            ))}
          </div>
        </div>

        {!candidate.securityId && (
          <div>
            <Label className="text-[10px]">Security (unresolved — pick one)</Label>
            <Select value={securityId} onValueChange={setSecurityId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select security" /></SelectTrigger>
              <SelectContent>
                {securities.map((s) => <SelectItem key={s.id} value={s.id}>{s.symbol}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label className="text-[10px]">Statement type</Label>
          <Select value={statementType} onValueChange={(v) => setStatementType(v as typeof statementType)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Income statement</SelectItem>
              <SelectItem value="balance">Balance sheet</SelectItem>
              <SelectItem value="cashflow">Cash flow</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Period type</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as typeof periodType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodType === "quarterly" && (
            <div>
              <Label className="text-[10px]">Fiscal quarter (1-4)</Label>
              <Input className="h-8 text-xs" value={fiscalQuarter} onChange={(e) => setFiscalQuarter(e.target.value)} />
            </div>
          )}
          <div>
            <Label className="text-[10px]">Fiscal year</Label>
            <Input className="h-8 text-xs" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2025" />
          </div>
          <div>
            <Label className="text-[10px]">Currency</Label>
            <Input className="h-8 text-xs" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px]">Period end (read from source doc)</Label>
            <Input className="h-8 text-xs" placeholder="2025-12-31" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px]">Reported/filed date</Label>
            <Input className="h-8 text-xs" placeholder="2026-03-02" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">
            {statementType} fields — pre-filled from the detected table, verify every number against the source before confirming
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STATEMENT_FIELDS[statementType].map((f) => (
              <div key={f}>
                <Label className="text-[10px] flex items-center gap-1">
                  {f}{REQUIRED_FIELDS[statementType].includes(f) && <span className="text-destructive">*</span>}
                </Label>
                <Input className="h-8 text-xs" value={fields[f] ?? ""} onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))} />
              </div>
            ))}
          </div>
          {data.draft.unmapped.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {data.draft.unmapped.length} detected row(s) not auto-mapped: {data.draft.unmapped.map((r) => r.label).join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label className="text-[10px]">Note (optional)</Label>
          <Textarea className="text-xs" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Confirmed against FY2025 annual report, page 42" />
        </div>

        {submitError && <p className="text-[11px] text-destructive">{submitError}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? "Confirming…" : "Confirm & write"}
          </Button>
          <Button variant="outline" disabled={submitting} onClick={reject}>Reject</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "candidates"],
    queryFn: () => adminFinancialsApi.listPending(100),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground p-4">Loading pending candidates…</p>;
  if (error) return <p className="text-xs text-destructive p-4">Failed to load candidates — check your admin key.</p>;
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground p-4">No pending candidates. The scraper hasn't detected any unreviewed financial tables.</p>;

  return (
    <div className="space-y-2">
      {data.map((c: FinancialStatementCandidate) => (
        <Card key={c.id} className="cursor-pointer active:opacity-70" onClick={() => onSelect(c.id)}>
          <CardContent className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{c.documentTitle ?? `Candidate #${c.id}`}</p>
              <p className="text-[10px] text-muted-foreground">
                {c.rawCompanyName ?? "Unresolved"} · {c.exchange} · {new Date(c.createdAt).toLocaleDateString()}
              </p>
            </div>
            {!c.securityId && <Badge variant="outline" className="text-[9px] shrink-0">unresolved</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminFinancialsReview() {
  const [unlocked, setUnlocked] = useState(!!getAdminKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  if (!unlocked) return <AdminKeyGate onUnlocked={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen max-w-lg mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-bold">Financials Review</h1>
        <Button variant="ghost" size="sm" onClick={() => { clearAdminKey(); setUnlocked(false); }}>
          <LogOut className="h-3.5 w-3.5 mr-1" /> Lock
        </Button>
      </div>

      {selectedId ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>&larr; Back to list</Button>
          <CandidateReviewForm
            candidateId={selectedId}
            onDone={() => {
              setSelectedId(null);
              queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
            }}
          />
        </>
      ) : (
        <CandidateList onSelect={setSelectedId} />
      )}
    </div>
  );
}