import type { IncomeStatement, BalanceSheet, CashFlowStatement } from "../../types/market.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeIncomeStatement(s: IncomeStatement): IncomeStatement {
  return {
    ...s,
    revenue: round2(s.revenue),
    netIncome: round2(s.netIncome),
    eps: round2(s.eps),
    grossProfit: s.grossProfit != null ? round2(s.grossProfit) : (s.costOfRevenue != null ? round2(s.revenue - s.costOfRevenue) : undefined),
  };
}

/** Flags (does not silently fix) balance sheets that don't balance beyond
 *  tolerance — the pipeline logs these as data-quality warnings rather than
 *  rejecting outright, since minor rounding drift from a provider is common
 *  but a >2% mismatch usually means a mis-mapped field. */
export function checkBalanceSheetIntegrity(b: BalanceSheet): { ok: boolean; deltaPercent: number } {
  const computed = b.totalLiabilities + b.totalEquity;
  const delta = Math.abs(b.totalAssets - computed);
  const deltaPercent = b.totalAssets !== 0 ? (delta / b.totalAssets) * 100 : 0;
  return { ok: deltaPercent <= 2, deltaPercent: round2(deltaPercent) };
}

export function normalizeCashFlow(c: CashFlowStatement): CashFlowStatement {
  return {
    ...c,
    // operatingCashFlow is optional now — not every provider (e.g. the previous provider)
    // supplies a cash flow statement at all. Only round/derive when it's
    // actually present; leave it undefined otherwise rather than treating
    // absence as zero.
    operatingCashFlow: c.operatingCashFlow != null ? round2(c.operatingCashFlow) : undefined,
    freeCashFlow:
      c.freeCashFlow != null
        ? round2(c.freeCashFlow)
        : c.capex != null && c.operatingCashFlow != null
          ? round2(c.operatingCashFlow - c.capex)
          : undefined,
  };
}
