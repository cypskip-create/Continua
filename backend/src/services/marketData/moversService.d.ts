import type { ExchangeCode } from "../../config/index.js";
export declare const moversService: {
    getTopMovers(exchange: ExchangeCode, limit?: number): Promise<{
        gainers: import("../../types/market.js").Quote[];
        losers: import("../../types/market.js").Quote[];
    }>;
};
