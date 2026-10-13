import type { ExchangeCode } from "../../config/index.js";
export interface ScreenerFilters {
    exchange: ExchangeCode;
    sector?: string;
    minMarketCap?: number;
    maxPe?: number;
    minDividendYield?: number;
    minAfriScore?: number;
    sortBy?: "afriScore" | "changePercent" | "marketCap" | "dividendYield" | "pe";
    sortDirection?: "asc" | "desc";
    limit?: number;
}
export declare const screeningService: {
    screen(filters: ScreenerFilters): Promise<any[]>;
};
