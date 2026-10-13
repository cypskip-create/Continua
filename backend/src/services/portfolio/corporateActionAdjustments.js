/**
 * Thin, deliberately small: the app's portfolio math (holdings, cost basis,
 * P/L) lives in the app itself against `public` schema tables. This service
 * exists only to hand the app the corporate-action data it needs to adjust
 * for splits/bonuses/dividends when computing returns — Continua Data
 * doesn't own portfolio state, it just supplies the facts.
 */
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
export const corporateActionAdjustments = {
    async getAdjustmentsSince(securityId, since) {
        const all = await corporateActionsRepository.getBySecurity(securityId);
        return all.filter((a) => a.announcedAt >= since && (a.type === "split" || a.type === "bonus_issue" || a.type === "dividend"));
    },
    /** Multiplicative share-count adjustment factor for splits/bonuses between
     *  two dates — apply to historical share counts when computing true
     *  time-weighted returns across a corporate action. */
    async getShareAdjustmentFactor(securityId, since) {
        const actions = await this.getAdjustmentsSince(securityId, since);
        return actions.reduce((factor, a) => {
            if (a.details.type === "split" || a.details.type === "bonus_issue") {
                return factor * (a.details.ratioTo / a.details.ratioFrom);
            }
            return factor;
        }, 1);
    },
};
