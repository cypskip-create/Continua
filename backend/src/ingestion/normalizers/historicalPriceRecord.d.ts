import { z } from "zod";
/** Source permission is an operator assertion retained with every imported observation.
 * Closing prices alone are NOT valid OHLC bars. */
export declare const HistoricalPriceRecordSchema: z.ZodEffects<z.ZodObject<{
    symbol: z.ZodString;
    date: z.ZodEffects<z.ZodString, string, string>;
    currency: z.ZodLiteral<"KES">;
    open: z.ZodNumber;
    high: z.ZodNumber;
    low: z.ZodNumber;
    close: z.ZodNumber;
    volume: z.ZodNumber;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    permissionReference: z.ZodString;
    adjustment: z.ZodLiteral<"unadjusted">;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    date: string;
    currency: "KES";
    sourceUrl: string;
    close: number;
    high: number;
    low: number;
    volume: number;
    open: number;
    permissionReference: string;
    adjustment: "unadjusted";
}, {
    symbol: string;
    date: string;
    currency: "KES";
    sourceUrl: string;
    close: number;
    high: number;
    low: number;
    volume: number;
    open: number;
    permissionReference: string;
    adjustment: "unadjusted";
}>, {
    symbol: string;
    date: string;
    currency: "KES";
    sourceUrl: string;
    close: number;
    high: number;
    low: number;
    volume: number;
    open: number;
    permissionReference: string;
    adjustment: "unadjusted";
}, {
    symbol: string;
    date: string;
    currency: "KES";
    sourceUrl: string;
    close: number;
    high: number;
    low: number;
    volume: number;
    open: number;
    permissionReference: string;
    adjustment: "unadjusted";
}>;
