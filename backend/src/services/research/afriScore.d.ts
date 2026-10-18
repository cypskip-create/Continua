/** C score is calculated in the bounded Python Engine. Legacy field names
 * remain compatible; missing factors/overall ratings are explicitly null. */
import type { ComputedRatios, AfriScoreResult } from "../../types/market.js";
export interface AfriScoreInputs {
    ratios: Omit<ComputedRatios, "securityId" | "asOf">;
    revenueGrowthYoy?: number | null;
    epsGrowthYoy?: number | null;
    fiveYearRevenueCagr?: number | null;
    sector?: string | null;
    basis?: string | null;
    fiscalYear?: number | null;
    filingDateKnown?: boolean;
    sourceUrls?: string[];
    calculatedAt?: string;
}
export declare function computeAfriScore(securityId: string, inputs: AfriScoreInputs): Promise<Omit<AfriScoreResult, "asOf">>;
