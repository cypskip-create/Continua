import { z } from "zod";
import type { PoolClient } from 'pg';
export declare const HistoricalConfirmSchema: z.ZodEffects<z.ZodObject<{
    securityId: z.ZodOptional<z.ZodString>;
    statementType: z.ZodEnum<["income", "balance", "cashflow"]>;
    unitsVerified: z.ZodLiteral<true>;
    periods: z.ZodArray<z.ZodObject<{
        columnIndex: z.ZodNumber;
        period: z.ZodObject<{
            periodType: z.ZodEnum<["annual", "quarterly"]>;
            fiscalYear: z.ZodNumber;
            fiscalQuarter: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            periodEnd: z.ZodEffects<z.ZodString, string, string>;
            reportedAt: z.ZodEffects<z.ZodString, string, string>;
            currency: z.ZodLiteral<"KES">;
        }, "strip", z.ZodTypeAny, {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        }, {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        }>;
        income: z.ZodOptional<z.ZodObject<{
            revenue: z.ZodNumber;
            netIncome: z.ZodNumber;
            eps: z.ZodOptional<z.ZodNumber>;
            costOfRevenue: z.ZodOptional<z.ZodNumber>;
            grossProfit: z.ZodOptional<z.ZodNumber>;
            operatingExpenses: z.ZodOptional<z.ZodNumber>;
            operatingIncome: z.ZodOptional<z.ZodNumber>;
            dilutedEps: z.ZodOptional<z.ZodNumber>;
            ebitda: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        }, {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        }>>;
        balance: z.ZodOptional<z.ZodObject<{
            totalAssets: z.ZodNumber;
            totalLiabilities: z.ZodNumber;
            totalEquity: z.ZodNumber;
            cash: z.ZodOptional<z.ZodNumber>;
            totalDebt: z.ZodOptional<z.ZodNumber>;
            currentAssets: z.ZodOptional<z.ZodNumber>;
            currentLiabilities: z.ZodOptional<z.ZodNumber>;
            sharesOutstanding: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        }, {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        }>>;
        cashflow: z.ZodOptional<z.ZodObject<{
            operatingCashFlow: z.ZodOptional<z.ZodNumber>;
            investingCashFlow: z.ZodOptional<z.ZodNumber>;
            financingCashFlow: z.ZodOptional<z.ZodNumber>;
            freeCashFlow: z.ZodOptional<z.ZodNumber>;
            capex: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        }, {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        }>>;
        sourcePage: z.ZodNumber;
        note: z.ZodString;
        allowRestatement: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        period: {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        };
        note: string;
        columnIndex: number;
        sourcePage: number;
        allowRestatement: boolean;
        income?: {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        } | undefined;
        balance?: {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        } | undefined;
        cashflow?: {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        } | undefined;
    }, {
        period: {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        };
        note: string;
        columnIndex: number;
        sourcePage: number;
        income?: {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        } | undefined;
        balance?: {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        } | undefined;
        cashflow?: {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        } | undefined;
        allowRestatement?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    periods: {
        period: {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        };
        note: string;
        columnIndex: number;
        sourcePage: number;
        allowRestatement: boolean;
        income?: {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        } | undefined;
        balance?: {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        } | undefined;
        cashflow?: {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        } | undefined;
    }[];
    statementType: "income" | "balance" | "cashflow";
    unitsVerified: true;
    securityId?: string | undefined;
}, {
    periods: {
        period: {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        };
        note: string;
        columnIndex: number;
        sourcePage: number;
        income?: {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        } | undefined;
        balance?: {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        } | undefined;
        cashflow?: {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        } | undefined;
        allowRestatement?: boolean | undefined;
    }[];
    statementType: "income" | "balance" | "cashflow";
    unitsVerified: true;
    securityId?: string | undefined;
}>, {
    periods: {
        period: {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        };
        note: string;
        columnIndex: number;
        sourcePage: number;
        allowRestatement: boolean;
        income?: {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        } | undefined;
        balance?: {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        } | undefined;
        cashflow?: {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        } | undefined;
    }[];
    statementType: "income" | "balance" | "cashflow";
    unitsVerified: true;
    securityId?: string | undefined;
}, {
    periods: {
        period: {
            currency: "KES";
            periodType: "annual" | "quarterly";
            fiscalYear: number;
            periodEnd: string;
            reportedAt: string;
            fiscalQuarter?: number | null | undefined;
        };
        note: string;
        columnIndex: number;
        sourcePage: number;
        income?: {
            revenue: number;
            netIncome: number;
            eps?: number | undefined;
            costOfRevenue?: number | undefined;
            grossProfit?: number | undefined;
            operatingExpenses?: number | undefined;
            operatingIncome?: number | undefined;
            dilutedEps?: number | undefined;
            ebitda?: number | undefined;
        } | undefined;
        balance?: {
            totalAssets: number;
            totalLiabilities: number;
            totalEquity: number;
            cash?: number | undefined;
            totalDebt?: number | undefined;
            currentAssets?: number | undefined;
            currentLiabilities?: number | undefined;
            sharesOutstanding?: number | undefined;
        } | undefined;
        cashflow?: {
            operatingCashFlow?: number | undefined;
            freeCashFlow?: number | undefined;
            investingCashFlow?: number | undefined;
            financingCashFlow?: number | undefined;
            capex?: number | undefined;
        } | undefined;
        allowRestatement?: boolean | undefined;
    }[];
    statementType: "income" | "balance" | "cashflow";
    unitsVerified: true;
    securityId?: string | undefined;
}>;
/** Publish explicitly reviewed base-unit columns together, or none of them. */
export declare function confirmHistoricalColumns(candidateId: string, raw: unknown, transaction?: PoolClient): Promise<{
    candidateId: string;
    periodIds: string[];
    sourceUrl: any;
}>;
