import type { IExchangeAdapter } from "../../adapters/types.js";
import type { MarketIndex } from "../../types/market.js";
export declare const indexCollector: {
    collectIndices(adapter: IExchangeAdapter): Promise<MarketIndex[]>;
};
