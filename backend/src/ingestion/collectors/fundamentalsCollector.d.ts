import type { IExchangeAdapter, FundamentalsBundle } from "../../adapters/types.js";
export interface FundamentalsCollectionResult {
    bundles: FundamentalsBundle[];
    failures: {
        symbol: string;
        error: string;
    }[];
}
export declare const fundamentalsCollector: {
    /** Per-symbol failures are returned, not swallowed — Promise.allSettled
     *  alone would silently drop a symbol that failed every retry. The
     *  pipeline dead-letters these so a persistently-failing symbol is
     *  visible instead of just quietly missing from the next screener run. */
    collectForSymbols(adapter: IExchangeAdapter, symbols: string[]): Promise<FundamentalsCollectionResult>;
};
