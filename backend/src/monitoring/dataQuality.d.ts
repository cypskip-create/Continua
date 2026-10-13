import type { Quote } from "../types/market.js";
export declare function checkQuoteFreshness(quote: Quote): {
    stale: boolean;
    ageMs: number;
};
export declare function checkDuplicateCandle(seen: Set<string>, key: string): boolean;
