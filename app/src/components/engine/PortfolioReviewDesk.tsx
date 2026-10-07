import { useState } from "react";
import { Link } from "react-router-dom";
import type { EnginePortfolio } from "@/api/engineWorkspaceApi";
import { reviewPortfolio, monthsToGoal } from "@/lib/portfolioReview";

export function PortfolioReviewDesk({ data: p }: { data: EnginePortfolio }) {
  const [cap, setCap] = useState(30),
    [shock, setShock] = useState(-10),
    [sector, setSector] = useState("All sectors");
  const [goal, setGoal] = useState(""),
    [monthly, setMonthly] = useState("");
  const rows = reviewPortfolio(p.positions, cap, shock, sector);
  const scenarioLoss = rows.reduce((sum, r) => sum + r.scenarioChange, 0);
  const breaches = rows.filter((r) => r.overLimit > 0);
  const months = monthsToGoal(p.totalValue, Number(goal), Number(monthly));
  const money = (n: number) =>
    `${p.currency ?? ""} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const control =
    "border border-border rounded-full bg-background px-3 py-2 text-sm min-h-11 max-w-full";
  const income = p.dividends
    .filter((d) => d.trailingIncome != null)
    .reduce((sum, d) => sum + (d.trailingIncome ?? 0), 0);
  const events = p.dividends
    .flatMap((d) => d.upcoming.map((e) => ({ ...e, symbol: d.symbol })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const exportReview = () => {
    const report = {
      asOf: new Date().toISOString(),
      currency: p.currency,
      coverage: p.coverage,
      assumptions: { capPercent: cap, shockPercent: shock, sector },
      positions: rows,
      warnings: [...p.warnings, ...p.historyWarnings],
      methodology:
        "Illustrative allocation review, not trade advice or a forecast. Includes only priced holdings.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "continua-portfolio-review.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!p.available || !p.positions.length) return null;
  return (
    <section
      className="space-y-4 border-y border-border py-4"
      aria-label="Portfolio review desk"
    >
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-lg">Your review desk</h3>
        <button className={control} onClick={exportReview}>
          Export review
        </button>
      </div>
      <div className="review-metrics">
        <div>
          <small>Largest holding</small>
          <strong>
            {Math.max(...p.positions.map((r) => r.weight)) * 100 >= 0
              ? `${(Math.max(...p.positions.map((r) => r.weight)) * 100).toFixed(1)}%`
              : "—"}
          </strong>
        </div>
        <div>
          <small>Income observed</small>
          <strong>
            {p.dividends.some((d) => d.trailingIncome != null)
              ? money(income)
              : "Unavailable"}
          </strong>
          <small>
            {p.dividends.filter((d) => d.trailingIncome != null).length}/
            {p.positions.length} holdings · trailing
          </small>
        </div>
        <div>
          <small>Next payment</small>
          <strong>{events[0]?.date ?? "Not disclosed"}</strong>
        </div>
      </div>
      <details open>
        <summary className="text-sm font-medium min-h-11 cursor-pointer">
          Allocation guardrails
        </summary>
        <label className="flex flex-wrap items-center gap-2 text-xs">
          Your single-holding limit
          <input
            className={control + " w-24"}
            aria-label="Single holding limit"
            type="number"
            min={1}
            max={100}
            value={cap}
            onChange={(e) =>
              setCap(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
            }
          />
          %
        </label>
        {breaches.length ? (
          breaches.map((r) => (
            <div key={r.symbol} className="market-row text-sm">
              <span>{r.symbol}</span>
              <span>
                {r.overLimit.toFixed(1)} percentage points above limit ·{" "}
                {money(r.excessValue)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground py-2">
            No priced holding exceeds your selected limit.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          A review flag, not a sell instruction. Missing prices, cash, fees and
          taxes are excluded.
        </p>
      </details>
      <details>
        <summary className="text-sm font-medium min-h-11 cursor-pointer">
          Portfolio stress lab
        </summary>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">
            Exposure
            <select
              className={control + " block mt-1"}
              aria-label="Stress sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              {[
                "All sectors",
                ...new Set(p.positions.map((r) => r.sector)),
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Assumed price change (%)
            <input
              className={control + " block mt-1 w-28"}
              aria-label="Stress price change"
              type="number"
              min={-100}
              max={100}
              value={shock}
              onChange={(e) =>
                setShock(Math.max(-100, Math.min(100, Number(e.target.value))))
              }
            />
          </label>
        </div>
        <p className="py-3 text-lg tabular-nums">
          Illustrative value: {money(p.totalValue + scenarioLoss)}{" "}
          <span className="text-sm text-muted-foreground">
            ({money(scenarioLoss)})
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Immediate uniform shock to selected priced holdings. No probabilities,
          correlations, future return or dividend assumptions.
        </p>
      </details>
      <details>
        <summary className="text-sm font-medium min-h-11 cursor-pointer">
          Contribution planner
        </summary>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs">
            Target invested value
            <input
              aria-label="Target invested value"
              className={control + " block mt-1 w-40"}
              type="number"
              min={0}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Monthly contribution
            <input
              aria-label="Monthly contribution"
              className={control + " block mt-1 w-40"}
              type="number"
              min={0}
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
            />
          </label>
        </div>
        {goal && (
          <p className="text-sm py-3">
            {months == null
              ? "Enter a positive monthly contribution."
              : months === 0
                ? "Your covered invested value already meets this target."
                : `${months} months at this contribution, assuming no gains or losses.`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          A savings illustration, not an investment forecast. Assumptions are
          temporary and do not alter your holdings.
        </p>
      </details>
      <details>
        <summary className="text-sm font-medium min-h-11 cursor-pointer">
          Research review queue
        </summary>
        {p.researchBriefing?.companies.map((c) => (
          <div key={c.symbol} className="border-t border-border py-2 text-xs">
            <Link
              className="text-primary font-medium"
              to={`/engine?symbol=${c.symbol}&tool=Briefing`}
            >
              {c.symbol} ·{" "}
              {c.period ? `FY${c.period}` : "Reporting period unavailable"}
            </Link>
            <p className="mt-1">
              {c.changes?.find((change) => change.material)?.text ??
                c.risks?.[0] ??
                c.findings?.[0] ??
                "Review the latest evidence and data coverage."}
            </p>
            <Link
              className="inline-block text-primary py-2"
              to={`/engine?symbol=${c.symbol}&tool=Journal`}
            >
              Record your thesis and next review
            </Link>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Review flags come from dated evidence, not generated investment
          recommendations.
        </p>
      </details>
    </section>
  );
}
