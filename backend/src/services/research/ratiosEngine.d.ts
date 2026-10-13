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
    netIncome?: number | null;
    revenue?: number | null;
    eps?: number | null;
    ebitda?: number | null;
    operatingIncome?: number | null;
    grossProfit?: number | null;
    totalEquity?: number | null;
    totalAssets?: number | null;
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
export declare function computeRatios(i: RatioInputs): Omit<ComputedRatios, "securityId" | "asOf">;
export declare function yoyGrowth(current: number, prior: number | null | undefined): number | undefined;
