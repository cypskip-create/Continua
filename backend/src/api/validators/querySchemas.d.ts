/**
 * Query-param validation, mirroring how ingestion validates incoming data
 * (ingestion/validators/schemas.ts) — the same discipline applied to the
 * other side of the system. A malformed query param now returns a clean
 * 400 with a specific reason instead of an ad-hoc check in each controller
 * (or, worse, silently falling through to a confusing 500).
 */
import { z } from "zod";
/** Every endpoint accepts ?exchange=, defaulting to NSE — this is what lets
 *  the same route set serve every future exchange without new routes. */
declare const ExchangeQuery: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
}, {
    exchange?: "NSE" | undefined;
}>;
export declare const QuotesBatchQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    symbols: z.ZodString;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    symbols: string;
}, {
    symbols: string;
    exchange?: "NSE" | undefined;
}>;
export declare const HistoricalQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    interval: z.ZodDefault<z.ZodEnum<["1m", "5m", "15m", "1h", "1d", "1w", "1M", "1y"]>>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1w" | "1M" | "1y";
    from?: string | undefined;
    to?: string | undefined;
}, {
    exchange?: "NSE" | undefined;
    from?: string | undefined;
    interval?: "1m" | "5m" | "15m" | "1h" | "1d" | "1w" | "1M" | "1y" | undefined;
    to?: string | undefined;
}>;
export declare const PerformanceQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    from: z.ZodEffects<z.ZodString, string, string>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    from: string;
    to?: string | undefined;
}, {
    from: string;
    exchange?: "NSE" | undefined;
    to?: string | undefined;
}>;
export declare const SparklinesQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    symbols: z.ZodString;
    points: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    symbols: string;
    points: number;
}, {
    symbols: string;
    exchange?: "NSE" | undefined;
    points?: number | undefined;
}>;
export declare const FinancialsQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    periodType: z.ZodDefault<z.ZodEnum<["annual", "quarterly"]>>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    periodType: "annual" | "quarterly";
}, {
    exchange?: "NSE" | undefined;
    periodType?: "annual" | "quarterly" | undefined;
}>;
export declare const FinancialsHistoryQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    periodType: z.ZodDefault<z.ZodEnum<["annual", "quarterly"]>>;
} & {
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    periodType: "annual" | "quarterly";
    limit: number;
}, {
    exchange?: "NSE" | undefined;
    periodType?: "annual" | "quarterly" | undefined;
    limit?: number | undefined;
}>;
export declare const MoversQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    limit: number;
}, {
    exchange?: "NSE" | undefined;
    limit?: number | undefined;
}>;
export declare const AnnouncementsQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    limit: number;
}, {
    exchange?: "NSE" | undefined;
    limit?: number | undefined;
}>;
export declare const NewsQuerySchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<["markets", "earnings", "companies", "economy", "top"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    category?: "markets" | "earnings" | "companies" | "economy" | "top" | undefined;
}, {
    limit?: number | undefined;
    category?: "markets" | "earnings" | "companies" | "economy" | "top" | undefined;
}>;
export declare const SecurityNewsQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    limit: number;
}, {
    exchange?: "NSE" | undefined;
    limit?: number | undefined;
}>;
export declare const ScreenerQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    sector: z.ZodOptional<z.ZodString>;
    minMarketCap: z.ZodOptional<z.ZodNumber>;
    maxPe: z.ZodOptional<z.ZodNumber>;
    minDividendYield: z.ZodOptional<z.ZodNumber>;
    minAfriScore: z.ZodOptional<z.ZodNumber>;
    sortBy: z.ZodDefault<z.ZodEnum<["afriScore", "changePercent", "marketCap", "dividendYield", "pe"]>>;
    sortDirection: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    exchange: "NSE";
    limit: number;
    sortBy: "afriScore" | "changePercent" | "marketCap" | "dividendYield" | "pe";
    sortDirection: "asc" | "desc";
    sector?: string | undefined;
    minMarketCap?: number | undefined;
    maxPe?: number | undefined;
    minDividendYield?: number | undefined;
    minAfriScore?: number | undefined;
}, {
    exchange?: "NSE" | undefined;
    limit?: number | undefined;
    sector?: string | undefined;
    minMarketCap?: number | undefined;
    maxPe?: number | undefined;
    minDividendYield?: number | undefined;
    minAfriScore?: number | undefined;
    sortBy?: "afriScore" | "changePercent" | "marketCap" | "dividendYield" | "pe" | undefined;
    sortDirection?: "asc" | "desc" | undefined;
}>;
export declare const IndicatorQuerySchema: z.ZodObject<{
    exchange: z.ZodDefault<z.ZodEnum<["NSE"]>>;
} & {
    type: z.ZodEnum<["SMA", "EMA", "RSI", "MACD"]>;
    period: z.ZodOptional<z.ZodNumber>;
    fast: z.ZodOptional<z.ZodNumber>;
    slow: z.ZodOptional<z.ZodNumber>;
    signal: z.ZodOptional<z.ZodNumber>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    type: "SMA" | "EMA" | "RSI" | "MACD";
    exchange: "NSE";
    from?: string | undefined;
    to?: string | undefined;
    period?: number | undefined;
    fast?: number | undefined;
    slow?: number | undefined;
    signal?: number | undefined;
}, {
    type: "SMA" | "EMA" | "RSI" | "MACD";
    exchange?: "NSE" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    period?: number | undefined;
    fast?: number | undefined;
    slow?: number | undefined;
    signal?: number | undefined;
}>;
export { ExchangeQuery };
