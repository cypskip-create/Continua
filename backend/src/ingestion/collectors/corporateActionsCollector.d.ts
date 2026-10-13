import type { IExchangeAdapter } from "../../adapters/types.js";
import type { CorporateAction, EarningsEvent, OwnershipRecord } from "../../types/market.js";
export interface OwnershipCollectionResult {
    records: OwnershipRecord[];
    failures: {
        symbol: string;
        error: string;
    }[];
}
export declare const corporateActionsCollector: {
    collectActions(adapter: IExchangeAdapter, since: string): Promise<CorporateAction[]>;
    collectEarnings(adapter: IExchangeAdapter, since: string): Promise<EarningsEvent[]>;
    collectOwnership(adapter: IExchangeAdapter, symbols: string[]): Promise<OwnershipCollectionResult>;
};
