export interface MarketObservation {
  symbol: string;
  sector: string | null;
  changePercent: number | null;
  volume: number | null;
  timestamp: string;
}

/** Snapshot signals, not trade-tape assertions. Missing/nonfinite observations never count as flat. */
export function analyseMarket(rows: MarketObservation[]) {
  const valid = rows.filter(
    (r) => r.changePercent != null && Number.isFinite(r.changePercent),
  );
  const boundaries = [-7, -5, -3, 0, 3, 5, 7];
  const labels = [
    "≤−7%",
    "−7–−5%",
    "−5–−3%",
    "−3–0%",
    "0%",
    "0–3%",
    "3–5%",
    "5–7%",
    "≥7%",
  ];
  const counts = labels.map(() => 0);
  for (const r of valid) {
    const value = r.changePercent!;
    const index =
      value === 0
        ? 4
        : value < 0
          ? boundaries.slice(0, 4).findIndex((b) => value <= b)
          : value < 3
            ? 5
            : value < 5
              ? 6
              : value < 7
                ? 7
                : 8;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const sectors = [...new Set(valid.map((r) => r.sector ?? "Other"))]
    .map((name) => {
      const members = valid.filter((r) => (r.sector ?? "Other") === name);
      return {
        name,
        changePercent:
          members.reduce((s, r) => s + r.changePercent!, 0) / members.length,
        coverage: members.length,
        symbols: members.map((r) => r.symbol),
      };
    })
    .sort((a, b) => b.changePercent - a.changePercent);
  return {
    coverage: valid.length,
    advancing: valid.filter((r) => r.changePercent! > 0).length,
    declining: valid.filter((r) => r.changePercent! < 0).length,
    unchanged: valid.filter((r) => r.changePercent === 0).length,
    distribution: labels.map((label, i) => ({ label, count: counts[i] })),
    sectors,
    monitor: [...valid]
      .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
      .slice(0, 20)
      .map((r) => ({
        ...r,
        signal:
          Math.abs(r.changePercent!) >= 5
            ? "Large session move"
            : "Session movement",
      })),
    methodology:
      "Equal-weight sector returns; latest published quote per issuer. Snapshot movements, not block trades or intraday volume anomalies.",
  };
}
