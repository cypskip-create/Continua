import { useMemo, useState } from "react";
import { Info, Loader2, ChevronDown, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { InfoTip } from "./InfoTip";
import { LockedPreview } from "./LockedPreview";
import type { ValuationResult } from "@/api/valuationApi";

interface HoldingLike {
  id: string;
  symbol: string;
  name?: string;
  shares: number;
  price: number;
  value: number;
}

interface PortfolioValuationsProps {
  holdings: HoldingLike[];
  valuations: Record<string, ValuationResult | undefined>;
  isLoading: boolean;
  isPremium?: boolean;
  showValues?: boolean;
  currencyLabel?: string;
}

// The three real, data-backed models Continua's valuation service computes
// (see backend/src/services/technical/valuationService.ts). No "DCF" or
// "Analyst" label here — Continua doesn't run a discounted-cash-flow model
// or aggregate street analyst targets yet, so we name what we actually have
// rather than borrow labels from apps that do
const MODEL_OPTIONS = [
  { key: "sector-pe", label: "Sector P/E", modelName: "Relative Valuation (Sector P/E)" },
  { key: "graham", label: "Graham Number", modelName: "Graham Number" },
  { key: "ddm", label: "Dividend Model", modelName: "Dividend Discount Model" },
] as const;

type ModelKey = (typeof MODEL_OPTIONS)[number]["key"];

const STORAGE_KEY = "continua-valuation-model-assignments";

function loadAssignments(): Record<string, ModelKey> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAssignments(map: Record<string, ModelKey>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

const fmtMoney = (v: number, currencyLabel: string, showValues: boolean) =>
  showValues ? `${currencyLabel}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "••••";

export function PortfolioValuations({
  holdings,
  valuations,
  isLoading,
  isPremium = false,
  showValues = true,
  currencyLabel = "KSh",
}: PortfolioValuationsProps) {
  const [assignments, setAssignments] = useState<Record<string, ModelKey>>(loadAssignments);
  const [expanded, setExpanded] = useState<"overvalued" | "undervalued" | "needs" | null>("needs");

  const assignAll = (key: ModelKey) => {
    const next: Record<string, ModelKey> = {};
    holdings.forEach((h) => { next[h.symbol] = key; });
    setAssignments(next);
    saveAssignments(next);
  };

  const assignOne = (symbol: string, key: ModelKey) => {
    const next = { ...assignments, [symbol]: key };
    setAssignments(next);
    saveAssignments(next);
  };

  const rows = useMemo(() => {
    return holdings.map((h) => {
      const val = valuations[h.symbol.toUpperCase()];
      const modelKey = assignments[h.symbol];
      const modelDef = modelKey ? MODEL_OPTIONS.find((m) => m.key === modelKey) : undefined;
      const model = modelDef ? val?.models.find((m) => m.model === modelDef.modelName) : undefined;
      const fairValue = model?.fairValue ?? null;
      const upsidePercent = model?.upsidePercent ?? null;

      let bucket: "needs" | "overvalued" | "undervalued" = "needs";
      if (!modelKey) bucket = "needs";
      else if (fairValue == null) bucket = "needs";
      else if (upsidePercent !== null && upsidePercent < -10) bucket = "overvalued";
      else bucket = "undervalued";

      return { holding: h, modelKey, fairValue, upsidePercent, bucket, unavailableReason: model?.unavailableReason };
    });
  }, [holdings, valuations, assignments]);

  const needsNarrative = rows.filter((r) => r.bucket === "needs");
  const overvalued = rows.filter((r) => r.bucket === "overvalued").sort((a, b) => (a.upsidePercent ?? 0) - (b.upsidePercent ?? 0));
  const undervalued = rows.filter((r) => r.bucket === "undervalued").sort((a, b) => (b.upsidePercent ?? 0) - (a.upsidePercent ?? 0));

  const assignedRows = rows.filter((r) => r.fairValue != null);
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalFairValue = assignedRows.reduce((s, r) => s + (r.fairValue as number) * r.holding.shares, 0);
  const coverage = holdings.length > 0 ? `${assignedRows.length}/${holdings.length}` : "0/0";

  // ── Advanced (Premium): every holding's fair value averaged across ALL
  // THREE real models it has data for — not just the one manually
  // assigned. Basic mode only ever surfaces the single assigned model.
  const consensusRows = useMemo(() => {
    return holdings.map((h) => {
      const val = valuations[h.symbol.toUpperCase()];
      const perModel = MODEL_OPTIONS.map((m) => {
        const model = val?.models.find((mm) => mm.model === m.modelName);
        return { ...m, fairValue: model?.fairValue ?? null, upsidePercent: model?.upsidePercent ?? null };
      });
      const available = perModel.filter((m) => m.fairValue != null);
      const consensusFairValue = available.length > 0
        ? available.reduce((s, m) => s + (m.fairValue as number), 0) / available.length
        : null;
      const spread = available.length > 1
        ? Math.max(...available.map((m) => m.fairValue as number)) - Math.min(...available.map((m) => m.fairValue as number))
        : 0;
      return { holding: h, perModel, available, consensusFairValue, spread };
    });
  }, [holdings, valuations]);
  const consensusAssigned = consensusRows.filter((r) => r.consensusFairValue != null);
  const consensusTotalFairValue = consensusAssigned.reduce((s, r) => s + (r.consensusFairValue as number) * r.holding.shares, 0);
  const consensusCoverage = holdings.length > 0 ? `${consensusAssigned.length}/${holdings.length}` : "0/0";

  if (isLoading) {
    return (
      <div className="card-gradient rounded-2xl p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Computing valuation models…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── PORTFOLIO VALUATION SUMMARY ── */}
      <div className="card-gradient rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-lg flex items-center gap-1.5">
            Portfolio Valuation
            <InfoTip>Compares current value against fair value from the model assigned to each holding — coverage shows how many holdings have a model assigned.</InfoTip>
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Value & Fair Value reflect {coverage} holdings so far.
        </p>
        <div className="flex gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio Value</p>
            <p className="text-xl font-bold tabular mt-0.5">{fmtMoney(totalValue, currencyLabel, showValues)}</p>
          </div>
          <div className="w-px bg-border/60" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fair Value · estimate</p>
            <p className="text-xl font-bold tabular mt-0.5">
              {assignedRows.length > 0 ? fmtMoney(totalFairValue, currencyLabel, showValues) : "—"}
            </p>
          </div>
        </div>
        {assignedRows.length > 0 && (
          (() => {
            const diffPct = totalFairValue > 0 ? ((totalFairValue - totalValue) / totalValue) * 100 : 0;
            const overall = diffPct < -10 ? "Overvalued" : diffPct > 10 ? "Undervalued" : "Fairly valued";
            const color = diffPct < -10 ? "text-bear" : diffPct > 10 ? "text-bull" : "text-muted-foreground";
            return (
              <p className={`text-[12px] font-semibold mt-3 ${color}`}>
                {overall} · {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}% vs current value
                <span className="text-muted-foreground font-normal"> (based on assigned models, {assignedRows.length} of {holdings.length} holdings)</span>
              </p>
            );
          })()
        )}
      </div>

      {/* ── ADVANCED: MULTI-MODEL CONSENSUS (Premium) ── */}
      <LockedPreview
        unlocked={isPremium}
        label="Unlock Consensus Valuation"
        locked={
          <div className="card-gradient rounded-2xl p-4 mt-3">
            <p className="text-[11px] text-muted-foreground mb-3">Value &amp; Consensus reflect {consensusCoverage} holdings so far.</p>
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio Value</p>
                <p className="text-xl font-bold tabular mt-0.5">{fmtMoney(totalValue, currencyLabel, showValues)}</p>
              </div>
              <div className="w-px bg-border/60" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Consensus Fair Value</p>
                <p className="text-xl font-bold tabular mt-0.5">
                  {consensusAssigned.length > 0 ? fmtMoney(consensusTotalFairValue, currencyLabel, showValues) : "—"}
                </p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-border/40">
              {consensusRows.filter((r) => r.available.length > 0).map((r) => (
                <div key={r.holding.id} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-bold">{r.holding.symbol}</p>
                    <p className="text-[12.5px] font-bold tabular">
                      {r.consensusFairValue != null ? fmtMoney(r.consensusFairValue, currencyLabel, showValues) : "—"}
                    </p>
                  </div>
                  <div className="flex gap-3 mt-1">
                    {r.perModel.map((m) => (
                      <span key={m.key} className="text-[10px] text-muted-foreground">
                        {m.label}: {m.fairValue != null ? fmtMoney(m.fairValue, currencyLabel, showValues) : "—"}
                      </span>
                    ))}
                  </div>
                  {r.available.length > 1 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Model agreement: {r.spread === 0 ? "exact" : `±${fmtMoney(r.spread / 2, currencyLabel, showValues)} spread`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        }
      >
        <div className="card-gradient rounded-2xl p-4">
          <h3 className="font-serif text-lg flex items-center gap-1.5">
            Consensus Fair Value
            <InfoTip>Premium: averages every holding's fair value across all three real models it has data for (Sector P/E, Graham Number, Dividend Model), instead of the single model you manually assign below.</InfoTip>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">Multi-model average — no single model picked by hand.</p>
        </div>
      </LockedPreview>

      {/* ── QUICK-ASSIGN ── */}
      <div className="card-gradient rounded-2xl p-4">
        <p className="text-[13px] font-bold">Assign a model to each stock.</p>
        <p className="text-[11px] text-muted-foreground mt-1 mb-3">
          Pick which of Continua's real valuation models should stand in for each holding's fair value.
        </p>
        <p className="section-eyebrow mb-2">Quick-assign all</p>
        <div className="flex gap-2">
          {MODEL_OPTIONS.map((m) => (
            <button
              key={m.key}
              data-small-target
              onClick={() => assignAll(m.key)}
              className="flex-1 h-9 rounded-full text-[11px] font-semibold bg-muted/60 hover:bg-muted transition-colors active:opacity-70"
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── NEEDS A MODEL ── */}
      {needsNarrative.length > 0 && (
        <BucketSection
          id="needs"
          dotColor="bg-amber-500"
          title="Needs a model"
          count={needsNarrative.length}
          subtitle="Assign a valuation model to unlock a fair value."
          expanded={expanded === "needs"}
          onToggle={() => setExpanded(expanded === "needs" ? null : "needs")}
        >
          {needsNarrative.map((r) => (
            <ValuationRow
              key={r.holding.id}
              row={r}
              currencyLabel={currencyLabel}
              showValues={showValues}
              onAssign={(key) => assignOne(r.holding.symbol, key)}
            />
          ))}
        </BucketSection>
      )}

      {/* ── OVERVALUED ── */}
      {overvalued.length > 0 && (
        <BucketSection
          id="overvalued"
          dotColor="bg-bear"
          title="Overvalued"
          count={overvalued.length}
          subtitle="Above your assigned model's fair value, worth a second look."
          expanded={expanded === "overvalued"}
          onToggle={() => setExpanded(expanded === "overvalued" ? null : "overvalued")}
        >
          {overvalued.map((r) => (
            <ValuationRow key={r.holding.id} row={r} currencyLabel={currencyLabel} showValues={showValues} onAssign={(key) => assignOne(r.holding.symbol, key)} />
          ))}
        </BucketSection>
      )}

      {/* ── UNDERVALUED & FAIRLY VALUED ── */}
      {undervalued.length > 0 && (
        <BucketSection
          id="undervalued"
          dotColor="bg-bull"
          title="Undervalued & fairly valued"
          count={undervalued.length}
          subtitle="At or below your assigned model's fair value."
          expanded={expanded === "undervalued"}
          onToggle={() => setExpanded(expanded === "undervalued" ? null : "undervalued")}
        >
          {undervalued.map((r) => (
            <ValuationRow key={r.holding.id} row={r} currencyLabel={currencyLabel} showValues={showValues} onAssign={(key) => assignOne(r.holding.symbol, key)} />
          ))}
        </BucketSection>
      )}
    </div>
  );
}

function BucketSection({
  dotColor, title, count, subtitle, expanded, onToggle, children,
}: {
  id: string;
  dotColor: string;
  title: string;
  count: number;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card-gradient rounded-2xl p-4">
      <button data-small-target onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-[13px] font-bold">{title}</span>
          <span className="text-[11px] text-muted-foreground bg-muted rounded-full w-5 h-5 inline-flex items-center justify-center">{count}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
      {expanded && <div className="mt-3 divide-y divide-border/40">{children}</div>}
    </div>
  );
}

function ValuationRow({
  row, currencyLabel, showValues, onAssign,
}: {
  row: { holding: HoldingLike; modelKey?: ModelKey; fairValue: number | null; upsidePercent: number | null; unavailableReason?: string };
  currencyLabel: string;
  showValues: boolean;
  onAssign: (key: ModelKey) => void;
}) {
  const { holding, modelKey, fairValue, upsidePercent, unavailableReason } = row;
  const positive = (upsidePercent ?? 0) > 0;

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold">{holding.symbol}</p>
          <p className="text-[10.5px] text-muted-foreground truncate max-w-[140px]">{holding.name || holding.symbol}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[13px] font-bold tabular">{fmtMoney(holding.price, currencyLabel, showValues)}</p>
          {fairValue != null && upsidePercent != null ? (
            <p className={`text-[10.5px] font-semibold tabular ${upsidePercent < -10 ? "text-bear" : upsidePercent > 10 ? "text-bull" : "text-muted-foreground"}`}>
              {Math.abs(upsidePercent).toFixed(1)}% {upsidePercent < 0 ? "overvalued" : "undervalued"}
            </p>
          ) : (
            <p className="text-[10.5px] text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {(!modelKey || fairValue == null) && (
        <div className="mt-2">
          {modelKey && unavailableReason && (
            <p className="text-[10px] text-muted-foreground mb-2 flex items-start gap-1">
              <Info className="h-2.5 w-2.5 mt-0.5 shrink-0" />{unavailableReason}
            </p>
          )}
          <div className="flex gap-1.5">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.key}
                data-small-target
                onClick={() => onAssign(m.key)}
                className={`flex-1 h-7 rounded-full text-[10px] font-semibold transition-colors ${
                  modelKey === m.key ? "bg-foreground text-background" : "bg-muted/60 hover:bg-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}