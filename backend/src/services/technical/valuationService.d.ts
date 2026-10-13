/**
 * Multiple valuation models computed from real, already-ingested data
 * (financials, live quotes, stored ratios, dividend history) — nothing
 * estimated or looked up externally. Every model that can't produce a
 * number for a given security (e.g. no dividend history for a DDM, or
 * fewer than 3 sector peers for relative valuation) is OMITTED from the
 * response with a stated reason, not filled with a guess.
 *
 * These are standard, textbook formulas, not proprietary models — and
 * they're simplifications of real valuation practice (single-stage DDM
 * assumes constant growth forever; Graham Number assumes AAA-bond-yield
 * assumptions from 1970s America that don't map cleanly onto African
 * markets). The response says so. This is meant to be A starting point
 * for a user's own thinking, not a price target.
 */
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import type { ExchangeCode } from "../../config/index.js";
export interface ValuationModel {
    model: string;
    fairValue: number | null;
    currentPrice: number;
    upsidePercent: number | null;
    inputs: Record<string, number | string | null>;
    methodology: string;
    /** Why fairValue is null, if it is — always present together with a
     *  null fairValue so the UI never has to guess why a model is missing. */
    unavailableReason?: string;
}
export interface ValuationResult {
    symbol: string;
    exchange: ExchangeCode;
    currentPrice: number;
    currency: string;
    models: ValuationModel[];
    caveat: string;
}
export declare const valuationService: {
    compute(exchange: ExchangeCode, symbol: string): Promise<ValuationResult | null>;
};
export declare function relativeValuationModel(exchange: ExchangeCode, securityId: string, sectorId: string | undefined, currentPrice: number, financials: Awaited<ReturnType<typeof financialsRepository.getLatestPeriodBundle>>): Promise<ValuationModel>;
export declare function dividendDiscountModel(currentPrice: number, dividends: Awaited<ReturnType<typeof corporateActionsRepository.getDividendsBySecurity>>, now?: Date): ValuationModel;
