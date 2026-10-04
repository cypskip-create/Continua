import { Fragment } from "react";
import { InfoTip } from "./InfoTip";

interface Pair { a: string; b: string; corr: number }

interface PortfolioCorrelationProps {
  pairs: Pair[];
  symbols: string[];
  isLoading?: boolean;
  hasEnoughData?: boolean;
}

function heatColor(corr: number) {
  // Blue (moves oppositely) -> neutral gray -> gold (moves together)
  const t = (corr + 1) / 2; // 0..1
  const r = Math.round(59 + t * (200 - 59));
  const g = Math.round(130 + t * (170 - 130));
  const b = Math.round(246 - t * (246 - 60));
  return `rgba(${r},${g},${b},0.55)`;
}

function PairRow({ p }: { p: Pair }) {
  const widthPct = Math.min(100, Math.abs(p.corr) * 100);
  const positive = p.corr >= 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-[0.75rem] font-bold w-24 shrink-0">{p.a} / {p.b}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${positive ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="text-[0.75rem] font-bold tabular w-12 text-right">{p.corr >= 0 ? "" : "−"}{Math.abs(p.corr).toFixed(2)}</span>
    </div>
  );
}

export function PortfolioCorrelation({ pairs, symbols, isLoading, hasEnoughData }: PortfolioCorrelationProps) {
  const sorted = [...pairs].sort((a, b) => b.corr - a.corr);
  const together = sorted.slice(0, 5);
  const leastTogether = [...sorted].reverse().slice(0, 5);

  const corrMap: Record<string, number> = {};
  pairs.forEach((p) => { corrMap[`${p.a}|${p.b}`] = p.corr; corrMap[`${p.b}|${p.a}`] = p.corr; });

  return (
    <div className="space-y-4">
      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg mb-1">Correlation</h3>
        <p className="text-[0.6875rem] text-muted-foreground mb-3">
          Whether that spread actually works, or your holdings rise and fall together. Based on {isLoading ? "…" : "180 days"} of daily price returns.
        </p>

        {isLoading ? (
          <p className="text-[0.6875rem] text-muted-foreground py-6 text-center">Loading price history…</p>
        ) : !hasEnoughData ? (
          <p className="text-[0.6875rem] text-muted-foreground py-6 text-center">
            Not enough price history on file yet to compute correlations — add more holdings or check back once more daily candles are recorded.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="section-eyebrow">Moves Together</p>
              <InfoTip>The pairings doing least to spread your risk — they tend to rise and fall together.</InfoTip>
            </div>
            <p className="text-[0.65625rem] text-muted-foreground mb-1">The pairings doing least to spread your risk.</p>
            {together.length === 0 ? <p className="text-[0.6875rem] text-muted-foreground py-2">No positively correlated pairs found.</p> : together.map((p) => <PairRow key={`${p.a}-${p.b}`} p={p} />)}

            <div className="flex items-center gap-1.5 mt-4 mb-1">
              <p className="section-eyebrow">Moves Least Together</p>
              <InfoTip>The pairings doing most to spread your risk — they move independently or oppositely.</InfoTip>
            </div>
            <p className="text-[0.65625rem] text-muted-foreground mb-1">The pairings doing most to spread your risk.</p>
            {leastTogether.length === 0 ? <p className="text-[0.6875rem] text-muted-foreground py-2">No pairs on file yet.</p> : leastTogether.map((p) => <PairRow key={`lt-${p.a}-${p.b}`} p={p} />)}
          </>
        )}
      </div>

      <div className="card-gradient rounded-2xl p-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className="font-serif text-lg">Correlation Matrix</h3>
          <InfoTip>Every pair of holdings, shaded by how closely the two have moved together over the lookback window.</InfoTip>
        </div>
        <p className="text-[0.6875rem] text-muted-foreground mb-3">Every pair of holdings, shaded by how closely the two have moved together.</p>

        {isLoading || !hasEnoughData ? (
          <p className="text-[0.6875rem] text-muted-foreground py-6 text-center">
            {isLoading ? "Loading price history…" : "Not enough price history on file yet."}
          </p>
        ) : (
          <div className="min-w-[480px]">
            <div className="grid" style={{ gridTemplateColumns: `72px repeat(${symbols.length}, 56px)` }}>
              <div />
              {symbols.map((s) => (
                <div key={s} className="text-[0.625rem] font-bold text-center pb-1.5">{s}</div>
              ))}
              {symbols.map((row) => (
                <Fragment key={row}>
                  <div className="text-[0.625rem] font-bold flex items-center pr-2">{row}</div>
                  {symbols.map((col) => {
                    const c = row === col ? 1 : corrMap[`${row}|${col}`];
                    return (
                      <div
                        key={`${row}-${col}`}
                        className="h-11 flex items-center justify-center text-[0.625rem] font-semibold rounded m-0.5"
                        style={{ background: c != null ? heatColor(c) : "hsl(var(--muted) / 0.3)" }}
                      >
                        {c != null ? c.toFixed(2) : "—"}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-4 text-[0.625rem] text-muted-foreground">
          <span>Move oppositely</span>
          <div className="flex-1 h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgb(59,130,246), rgb(200,170,60))" }} />
          <span>Move together</span>
        </div>
        <p className="text-[0.625rem] text-muted-foreground mt-2">The middle of the scale is 0, where two holdings move independently of each other.</p>
      </div>
    </div>
  );
}
