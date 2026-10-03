/**
 * Deterministic ratio calculations. Every formula here is standard finance —
 * nothing proprietary lives in this file (that's afriScore.ts). Inputs are
 * plain numbers so this stays trivially unit-testable without touching the
 * database or an adapter.
 */
import type { ComputedRatios } from "../../types/market.js";

export interface RatioInputs {
  price: number;
  sharesOutstanding?: number | null;
  netIncome: number;
  revenue: number;
  ebitda?: number | null;
  operatingIncome?: number | null;
  grossProfit?: number | null;
  totalEquity: number;
  totalAssets: number;
  totalDebt?: number | null;
  cash?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  dividendPerShareTtm?: number | null;
  priorYearNetIncome?: number | null;
  interestExpense?: number | null;
  /** trailing daily closes, oldest→newest, used for momentum/volatility */
  priceHistory90d?: number[];
}

const safeDiv = (a: number | null | undefined, b: number | null | undefined): number | undefined => {
  if (a == null || b == null || b === 0) return undefined;
  return a / b;
};
const round4 = (n: number | undefined) => (n == null ? undefined : Math.round(n * 10000) / 10000);

export function computeRatios(i: RatioInputs): Omit<ComputedRatios, "securityId" | "asOf"> {
  const eps = i.sharesOutstanding ? i.netIncome / i.sharesOutstanding : undefined;
  const bookValuePerShare = i.sharesOutstanding ? i.totalEquity / i.sharesOutstanding : undefined;
  const marketCap = i.sharesOutstanding ? i.price * i.sharesOutstanding : undefined;
  const enterpriseValue = marketCap != null ? marketCap + (i.totalDebt ?? 0) - (i.cash ?? 0) : undefined;

  const priceMomentum3m = i.priceHistory90d && i.priceHistory90d.length >= 2
    ? round4((i.priceHistory90d[i.priceHistory90d.length - 1]! - i.priceHistory90d[0]!) / i.priceHistory90d[0]!)
    : undefined;

  const volatility90d = i.priceHistory90d && i.priceHistory90d.length >= 3
    ? round4(computeAnnualizedVolatility(i.priceHistory90d))
    : undefined;

  return {
    pe: round4(safeDiv(i.price, eps)),
    ps: round4(safeDiv(marketCap, i.revenue)),
    pb: round4(safeDiv(i.price, bookValuePerShare)),
    evEbitda: round4(safeDiv(enterpriseValue, i.ebitda ?? undefined)),
    roe: round4(safeDiv(i.netIncome, i.totalEquity)),
    roa: round4(safeDiv(i.netIncome, i.totalAssets)),
    roic: round4(safeDiv(i.operatingIncome ?? undefined, (i.totalEquity + (i.totalDebt ?? 0)))),
    grossMargin: round4(safeDiv(i.grossProfit ?? undefined, i.revenue)),
    operatingMargin: round4(safeDiv(i.operatingIncome ?? undefined, i.revenue)),
    netMargin: round4(safeDiv(i.netIncome, i.revenue)),
    dividendYield: round4(safeDiv(i.dividendPerShareTtm ?? undefined, i.price)),
    payoutRatio: round4(safeDiv(i.dividendPerShareTtm ?? undefined, eps)),
    currentRatio: round4(safeDiv(i.currentAssets ?? undefined, i.currentLiabilities ?? undefined)),
    debtToEquity: round4(safeDiv(i.totalDebt ?? undefined, i.totalEquity)),
    interestCoverage: round4(safeDiv(i.operatingIncome ?? undefined, i.interestExpense ?? undefined)),
    priceMomentum3m,
    volatility90d,
  };
}

function computeAnnualizedVolatility(prices: number[]): number {
  const returns: number[] = [];
  for (let idx = 1; idx < prices.length; idx++) {
    returns.push(Math.log(prices[idx]! / prices[idx - 1]!));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyStdDev = Math.sqrt(variance);
  return dailyStdDev * Math.sqrt(252); // annualized
}

export function yoyGrowth(current: number, prior: number | null | undefined): number | undefined {
  if (prior == null || prior === 0) return undefined;
  return (current - prior) / Math.abs(prior);
}
