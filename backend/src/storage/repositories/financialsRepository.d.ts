import type { FinancialPeriod, IncomeStatement, BalanceSheet, CashFlowStatement } from "../../types/market.js";
export declare const financialsRepository: {
    upsertPeriod(period: FinancialPeriod): Promise<void>;
    upsertIncomeStatement(income: IncomeStatement): Promise<void>;
    upsertBalanceSheet(balance: BalanceSheet): Promise<void>;
    upsertCashFlowStatement(cashFlow: CashFlowStatement): Promise<void>;
    /** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
    upsertPeriodBundle(period: FinancialPeriod, income: IncomeStatement, balance: BalanceSheet, cashFlow: CashFlowStatement): Promise<void>;
    getLatestPeriodBundle(securityId: string, periodType?: "annual" | "quarterly"): Promise<any>;
    getHistoricalPeriods(securityId: string, periodType: "annual" | "quarterly", limit?: number): Promise<any[]>;
};
