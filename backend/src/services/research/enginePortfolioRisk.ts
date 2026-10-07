import { alignedReturns } from "./enginePortfolio.js";

type Bar = { timestamp: string; close: number };
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const volatility = (values: number[]) => {
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - average) ** 2, 0) / (values.length - 1)) * Math.sqrt(252) * 100;
};
const drawdown = (values: number[]) => {
  let peak = values[0]!, worst = 0;
  for (const value of values) { peak = Math.max(peak, value); worst = Math.min(worst, value / peak - 1); }
  return worst * 100;
};

/** Current-weight history is an illustrative basket, never actual account return. */
export function portfolioRisk(series: Record<string, Bar[]>, weights: Record<string, number>) {
  const usable = Object.fromEntries(Object.entries(series).filter(([symbol, bars]) =>
    (weights[symbol] ?? 0) > 0 && bars.filter(b => Number.isFinite(b.close) && b.close > 0).length >= 21));
  const aligned = alignedReturns(usable), symbols = Object.keys(usable);
  const maps = Object.fromEntries(symbols.map(symbol => [symbol, new Map(usable[symbol]!.filter(b => Number.isFinite(b.close) && b.close > 0).map(b => [b.timestamp.slice(0, 10), b.close]))]));
  const returns: Record<string, number[]> = Object.fromEntries(symbols.map(s => [s, []]));
  let excludedIntervals = 0;
  for (let i = 1; i < aligned.dates.length; i++) {
    const before = aligned.dates[i - 1]!, after = aligned.dates[i]!;
    // Long missing-data intervals cannot be treated as single daily returns.
    if (Date.parse(after) - Date.parse(before) > 4 * 86400000) { excludedIntervals++; continue; }
    symbols.forEach(s => returns[s]!.push(maps[s]!.get(after)! / maps[s]!.get(before)! - 1));
  }
  const count = symbols.length ? returns[symbols[0]!]!.length : 0;
  const coveredWeight = symbols.reduce((sum, symbol) => sum + weights[symbol]!, 0);
  if (!symbols.length || count < 20 || coveredWeight <= 0) return {
    available: false as const, reason: "At least 20 common short-interval returns are required for portfolio risk.",
    symbols, observations: count, excludedIntervals, coveredWeight, metrics: null,
  };
  const basket = Array.from({ length: count }, (_, i) => mean(symbols.map(s => returns[s]![i]!)));
  const weighted = Array.from({ length: count }, (_, i) => symbols.reduce((sum, s) => sum + returns[s]![i]! * weights[s]!, 0) / coveredWeight);
  const basketMean = mean(basket), portfolioMean = mean(weighted);
  const variance = basket.reduce((sum, r) => sum + (r - basketMean) ** 2, 0);
  const covariance = weighted.reduce((sum, r, i) => sum + (r - portfolioMean) * (basket[i]! - basketMean), 0);
  const curve = [100]; weighted.forEach(r => curve.push(curve.at(-1)! * (1 + r)));
  return {
    available: true as const, reason: "Hypothetical daily-rebalanced current-weight basket; excluded gaps are omitted. Beta compares your holdings' equal-weight basket, not an exchange index. Sharpe and Sortino require a verified risk-free-rate feed and are unavailable.",
    symbols, observations: count, excludedIntervals, coveredWeight,
    metrics: {
      portfolioVolatility: volatility(weighted), marketVolatility: volatility(basket), portfolioMaxDrawdown: drawdown(curve),
      portfolioBeta: variance > 0 ? covariance / variance : null, sharpe: null, sortino: null,
      volatilityByHolding: symbols.map(symbol => ({ symbol, volatility: volatility(returns[symbol]!) })),
      drawdownByHolding: symbols.map(symbol => {
        const values = [100]; returns[symbol]!.forEach(r => values.push(values.at(-1)! * (1 + r)));
        return { symbol, drawdown: drawdown(values) };
      }),
    },
  };
}
