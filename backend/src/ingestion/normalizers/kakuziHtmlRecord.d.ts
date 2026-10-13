import type { DetectedFinancialTable } from '../../types/market.js';
export declare const KAKUZI_HTML_VERSION = "kakuzi-five-year-html-2025-v1";
/** Verified issuer table, not a general HTML financial inference engine.
 * Availability is first archive observation, NOT an invented release date. */
export declare function validateKakuziHtmlRecord(text: string, tables: DetectedFinancialTable[], securityId: string, observedDate: string): {
    table: DetectedFinancialTable;
    confirmation: {
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
    };
}[];
