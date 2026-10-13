import type { MarketIndex } from "../../types/market.js";
import type { ExchangeCode } from "../../config/index.js";
export declare const indexService: {
    getIndices(exchange: ExchangeCode): Promise<MarketIndex[]>;
};
