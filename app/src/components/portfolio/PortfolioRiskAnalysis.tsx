import { useState } from "react";
import { InfoTip } from "./InfoTip";

interface HoldingLike { symbol: string; weight: number }

interface RiskData {
  isLoading: boolean;
  hasEnoughData: boolean;
  portfolioVolatility: number;
  marketVolatility: number;
  portfolioMaxDrawdown: number;
  portfolioBeta: number | null;
  sharpe: number | null;
  sortino: number | null;
  volatilityByHolding: { symbol: string; volatility: number }[];
  drawdownByHolding: { symbol: string; drawdown: number }[];
}

interface PortfolioRiskAnalysisProps {
  holdings: HoldingLike[];
  risk: RiskData;
}

function computeRiskScore(risk: RiskData, top3Concentration: number): number {
  const volScore = Math.min(25, (risk.portfolioVolatility / 40) * 25);
  const ddScore = Math.min(25, (Math.abs(risk.portfolioMaxDrawdown) / 50) * 25);
  const concScore = Math.min(25, (top3Concentration / 100) * 25);
  const betaScore = Math.min(25, (Math.min(2, risk.portfolioBeta ?? 1) / 2) * 25);
  return Math.round(volScore + ddScore + concScore + betaScore);
}

function riskLabel(score: number) {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Very high";
}

export function PortfolioRiskAnalysis({ holdings, risk }: PortfolioRiskAnalysisProps) {
  const [tab, setTab] = useState<"volatility" | "drawdown" | "beta">("volatility");

  const sortedByWeight = [...holdings].sort((a, b) => b.weight - a.weight);
  const top3Concentration = sortedByWeight.slice(0, 3).reduce((s, h) => s + h.weight, 0);
  const largest = sortedByWeight[0]?.symbol ?? "—";

  const score = risk.hasEnoughData ? computeRiskScore(risk, top3Concentration) : null;

  return (
    <div className="space-y-4">
      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg mb-1">Risk Analysis</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          An overall risk score for your portfolio, and the volatility, drawdowns and risk-adjusted returns behind it.
        </p>

        <div className="rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-[13px] font-bold">Continua Risk Score</p>
            <InfoTip>
              A composite 0–100 score from four real inputs: annualized volatility, max drawdown,
              top-3 concentration, and beta vs. an equal-weight basket of your own holdings — this
              is Continua's own methodology, not Simply Wall St's published one.
            </InfoTip>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">One number for how much risk is built into the way your portfolio is put together.</p>

          {risk.isLoading ? (
            <p className="text-[11px] text-muted-foreground py-4 text-center">Loading price history…</p>
          ) : score == null ? (
            <p className="text-[11px] text-muted-foreground py-4 text-center">Not enough price history on file yet to compute a score.</p>
          ) : (
            <>
              <p className="text-3xl font-bold tabular text-right">{score}<span className="text-base text-muted-foreground">/100</span></p>
              <div className="relative h-2.5 rounded-full mt-3" style={{ background: "linear-gradient(90deg, #3b82f6, #a855f7, #ef4444)" }}>
                <div className="absolute -top-1.5 w-1 h-5 bg-white rounded-full" style={{ left: `${score}%` }} />
              </div>
              <p className="text-[11px] text-center mt-1.5 font-semibold">{riskLabel(score)}</p>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Low</span><span>Very high</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card-gradient rounded-2xl p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="font-serif text-lg">Risk Metrics</h3>
          <InfoTip>The standard measures behind the score, each compared with a reference point where available.</InfoTip>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Portfolio Volatility" value={risk.isLoading ? "—" : `${risk.portfolioVolatility.toFixed(1)}%`} note={risk.hasEnoughData ? `vs basket ${risk.marketVolatility.toFixed(1)}%` : "Not enough data"} />
          <MetricCard label="Max Drawdown" value={risk.isLoading ? "—" : `${risk.portfolioMaxDrawdown.toFixed(1)}%`} note="Peak to trough, this lookback window" />
          <MetricCard label="Top 3 Concentration" value={`${top3Concentration.toFixed(1)}%`} note={`Largest is ${largest}`} />
          <MetricCard label="Portfolio Beta" value={risk.portfolioBeta != null ? `${risk.portfolioBeta.toFixed(2)}x` : "—"} note="vs. equal-weight basket of your holdings" />
          <MetricCard label="Sharpe Ratio" value={risk.sharpe != null ? risk.sharpe.toFixed(2) : "—"} note="Above 2.0 is generally considered very good" />
          <MetricCard label="Sortino Ratio" value={risk.sortino != null ? risk.sortino.toFixed(2) : "—"} note="Above 3.0 is exceptional for the risk taken" />
        </div>
      </div>

      <div className="card-gradient rounded-2xl p-4">
        <div className="flex gap-1.5 mb-3">
          {(["volatility", "drawdown", "beta"] as const).map((k) => (
            <button
              key={k}
              data-small-target
              onClick={() => setTab(k)}
              className={`h-8 px-3 rounded-full text-[11px] font-semibold capitalize ${tab === k ? "contrast-active" : "bg-muted/60"}`}
            >
              {k === "drawdown" ? "Max Drawdown" : k}
            </button>
          ))}
        </div>

        {tab === "volatility" && (
          <RiskByHoldingList
            title="Volatility by Holding"
            description="Which of your holdings give the bumpiest ride, annualized from daily price moves."
            rows={risk.volatilityByHolding.map((r) => ({ symbol: r.symbol, value: r.volatility }))}
            extra={risk.hasEnoughData ? [{ symbol: "Basket", value: risk.marketVolatility }, { symbol: "Portfolio", value: risk.portfolioVolatility }] : []}
            fmt={(v) => `${v.toFixed(1)}%`}
            isLoading={risk.isLoading}
          />
        )}
        {tab === "drawdown" && (
          <RiskByHoldingList
            title="Max Drawdown by Holding"
            description="The worst peak-to-trough decline for each holding in this lookback window."
            rows={risk.drawdownByHolding.map((r) => ({ symbol: r.symbol, value: r.drawdown }))}
            extra={risk.hasEnoughData ? [{ symbol: "Portfolio", value: risk.portfolioMaxDrawdown }] : []}
            fmt={(v) => `${v.toFixed(1)}%`}
            isLoading={risk.isLoading}
            negative
          />
        )}
        {tab === "beta" && (
          <p className="text-[11px] text-muted-foreground py-4 text-center">
            {risk.portfolioBeta != null
              ? `Portfolio beta is ${risk.portfolioBeta.toFixed(2)}x vs. an equal-weight basket of your own holdings — ${(Math.abs(1 - risk.portfolioBeta) * 100).toFixed(0)}% ${risk.portfolioBeta < 1 ? "less" : "more"} sensitive than that basket.`
              : "Not enough price history on file yet to compute beta."}
          </p>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular mt-0.5">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>
    </div>
  );
}

function RiskByHoldingList({ title, description, rows, extra, fmt, isLoading, negative }: {
  title: string; description: string; rows: { symbol: string; value: number }[]; extra: { symbol: string; value: number }[];
  fmt: (v: number) => string; isLoading: boolean; negative?: boolean;
}) {
  if (isLoading) return <p className="text-[11px] text-muted-foreground py-4 text-center">Loading price history…</p>;
  if (rows.length === 0) return <p className="text-[11px] text-muted-foreground py-4 text-center">Not enough price history on file yet.</p>;

  const all = [...rows, ...extra];
  const maxAbs = Math.max(1, ...all.map((r) => Math.abs(r.value)));

  return (
    <div>
      <p className="text-[13px] font-bold mb-0.5">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-3">{description}</p>
      <div className="space-y-2">
        {all.map((r) => {
          const isSpecial = r.symbol === "Portfolio" || r.symbol === "Basket";
          const widthPct = Math.max(3, (Math.abs(r.value) / maxAbs) * 100);
          return (
            <div key={r.symbol} className="flex items-center gap-3">
              <span className={`text-[11px] w-16 shrink-0 ${isSpecial ? "font-bold" : "font-semibold"}`}>{r.symbol}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPct}%`, background: r.symbol === "Portfolio" ? "hsl(217 91% 60%)" : r.symbol === "Basket" ? "hsl(var(--muted-foreground))" : negative ? "hsl(var(--bull))" : "hsl(270 91% 65%)" }}
                />
              </div>
              <span className="text-[11px] font-semibold tabular w-14 text-right">{fmt(r.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
