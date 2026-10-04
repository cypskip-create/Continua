import { useState } from "react";
import { CheckCircle2, XCircle, ChevronRight } from "lucide-react";

export interface CriteriaCheck {
  label: string;
  status: "pass" | "fail" | "unknown";
  /** One sentence explaining this specific check — shown when expanded. */
  detail?: string;
}

interface CriteriaChecklistProps {
  checks: CriteriaCheck[];
  /** Auto-written summary sentence(s), same convention as Simply Wall
   *  St's "TOTL's earnings have been declining at..." narrative. */
  narrative: string;
}

/** The pass/fail circle strip + narrative every major report section
 *  opens with. `unknown` checks (no real data source) render as a
 *  neutral dash rather than a false pass or fail — Continua doesn't
 *  guess when a criterion can't be evaluated. */
export function CriteriaChecklist({ checks, narrative }: CriteriaChecklistProps) {
  const [expanded, setExpanded] = useState(false);
  const evaluable = checks.filter((c) => c.status !== "unknown");
  const passed = evaluable.filter((c) => c.status === "pass").length;

  return (
    <div className="card-gradient rounded-2xl p-4">
      <button
        data-small-target
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[0.78125rem] font-semibold">Criteria checks {passed}/{evaluable.length || checks.length}</span>
          <div className="flex items-center gap-1">
            {checks.map((c, i) => (
              c.status === "pass" ? (
                <CheckCircle2 key={i} className="h-4 w-4 text-bull" />
              ) : c.status === "fail" ? (
                <XCircle key={i} className="h-4 w-4 text-bear" />
              ) : (
                <span key={i} className="h-4 w-4 rounded-full border border-muted-foreground/40 flex items-center justify-center text-[0.5rem] text-muted-foreground">—</span>
              )
            ))}
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      <p className="text-[0.78125rem] text-muted-foreground mt-2 leading-snug">{narrative}</p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/50 divide-y divide-border/30">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 py-2">
              {c.status === "pass" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-bull mt-0.5 shrink-0" />
              ) : c.status === "fail" ? (
                <XCircle className="h-3.5 w-3.5 text-bear mt-0.5 shrink-0" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[0.75rem] font-medium">{c.label}</p>
                {c.detail && <p className="text-[0.6875rem] text-muted-foreground mt-0.5">{c.detail}</p>}
                {c.status === "unknown" && !c.detail && <p className="text-[0.6875rem] text-muted-foreground mt-0.5">No data on file to evaluate this yet.</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
