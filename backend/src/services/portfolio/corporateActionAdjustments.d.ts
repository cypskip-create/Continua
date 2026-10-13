import type { CorporateAction } from "../../types/market.js";
export declare const corporateActionAdjustments: {
    getAdjustmentsSince(securityId: string, since: string): Promise<CorporateAction[]>;
    /** Multiplicative share-count adjustment factor for splits/bonuses between
     *  two dates — apply to historical share counts when computing true
     *  time-weighted returns across a corporate action. */
    getShareAdjustmentFactor(securityId: string, since: string): Promise<number>;
};
