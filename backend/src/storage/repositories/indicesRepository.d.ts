import type { MarketIndex } from "../../types/market.js";
export declare const indicesRepository: {
    upsertIndex(idx: MarketIndex): Promise<void>;
    upsertIndicesBatch(indices: MarketIndex[]): Promise<void>;
    listByExchange(exchange: string): Promise<MarketIndex[]>;
};
