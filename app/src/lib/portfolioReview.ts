export interface ReviewPosition {
  symbol: string;
  value: number;
  weight: number;
  sector: string;
}
/** Illustrative assumptions only. Not a forecast, recommendation or trade order. */
export function reviewPortfolio(
  positions: ReviewPosition[],
  capPercent: number,
  shockPercent: number,
  sector: string,
) {
  const total = positions.reduce((sum, p) => sum + p.value, 0);
  return positions.map((p) => ({
    ...p,
    overLimit: Math.max(0, p.weight * 100 - capPercent),
    excessValue: Math.max(0, p.value - (total * capPercent) / 100),
    scenarioChange:
      sector === "All sectors" || p.sector === sector
        ? (p.value * shockPercent) / 100
        : 0,
  }));
}
export function monthsToGoal(
  current: number,
  goal: number,
  monthly: number,
): number | null {
  if (goal <= current) return 0;
  return monthly > 0 ? Math.ceil((goal - current) / monthly) : null;
}
