/**
 * AfriFinance's proprietary scoring layer. Every sub-score is 0-100,
 * deterministic, and built from a documented set of inputs + weights so it
 * can be explained, tested, and improved without breaking the API contract
 * (AfriScoreResult never changes shape — only the numbers inside it can).
 *
 * This is intentionally simple, transparent scoring (weighted normalized
 * inputs), not a black-box model — that's a deliberate product choice for
 * a research tool people are trusting with their money.
 */
import type { ComputedRatios, AfriScoreResult } from "../../types/market.js";
export interface AfriScoreInputs {
    ratios: Omit<ComputedRatios, "securityId" | "asOf">;
    revenueGrowthYoy?: number | null;
    epsGrowthYoy?: number | null;
    fiveYearRevenueCagr?: number | null;
}
/** Overall AfriScore — a weighted blend of all seven, tuned to lean
 *  slightly toward quality + health (capital preservation) over pure
 *  momentum, appropriate for a long-horizon investing audience. Weights are
 *  a single named constant so they're easy to find and tune later. */
export declare const AFRI_SCORE_WEIGHTS: {
    readonly value: 0.2;
    readonly growth: 0.15;
    readonly health: 0.2;
    readonly income: 0.1;
    readonly risk: 0.15;
    readonly quality: 0.15;
    readonly momentum: 0.05;
};
export declare function computeAfriScore(securityId: string, inputs: AfriScoreInputs): Omit<AfriScoreResult, "asOf">;
