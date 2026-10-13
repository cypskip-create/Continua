import type { IncomeStatement, BalanceSheet, CashFlowStatement } from "../../types/market.js";
export declare function normalizeIncomeStatement(s: IncomeStatement): IncomeStatement;
/** Flags (does not silently fix) balance sheets that don't balance beyond
 *  tolerance — the pipeline logs these as data-quality warnings rather than
 *  rejecting outright, since minor rounding drift from a provider is common
 *  but a >2% mismatch usually means a mis-mapped field. */
export declare function checkBalanceSheetIntegrity(b: BalanceSheet): {
    ok: boolean;
    deltaPercent: number;
};
export declare function normalizeCashFlow(c: CashFlowStatement): CashFlowStatement;
