import type { CorporateAction, EarningsEvent, OwnershipRecord } from "../../types/market.js";
export declare const corporateActionsRepository: {
    upsertCorporateAction(a: CorporateAction): Promise<void>;
    getBySecurity(securityId: string): Promise<CorporateAction[]>;
    getDividendsBySecurity(securityId: string): Promise<CorporateAction[]>;
    /** Market-wide upcoming dividends for the Markets page calendar — real,
     *  forward-looking data: an ex-date is a fact stated in the company's
     *  own dividend announcement, not a prediction, so this is safe to show
     *  as "upcoming" (unlike earnings — see getRecentEarnings below). Only
     *  returns dividends whose ex_date hasn't passed yet. */
    getUpcomingDividends(exchange: string, limit?: number): Promise<(CorporateAction & {
        symbol: string;
        companyName: string;
    })[]>;
    /** Market-wide RECENT (already reported) earnings for the Markets page —
     *  deliberately "recent", never "upcoming": expected_date/eps_estimate
     *  columns exist in the schema but nothing in this system has a real
     *  analyst-estimates source to populate them honestly, so this only
     *  ever surfaces reported_date/eps_actual — facts, not predictions. */
    getRecentEarnings(exchange: string, limit?: number): Promise<(EarningsEvent & {
        symbol: string;
        companyName: string;
    })[]>;
    getEarningsBySecurity(securityId: string, limit?: number): Promise<EarningsEvent[]>;
    upsertEarningsEvent(e: EarningsEvent): Promise<void>;
    upsertOwnership(records: OwnershipRecord[]): Promise<void>;
    getOwnership(securityId: string): Promise<OwnershipRecord[]>;
};
