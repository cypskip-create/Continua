import { type IndicatorSeries, type MacdResult } from "./indicators.js";
import type { ExchangeCode } from "../../config/index.js";
export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD";
export interface IndicatorRequest {
    exchange: ExchangeCode;
    symbol: string;
    type: IndicatorType;
    period?: number;
    fast?: number;
    slow?: number;
    signal?: number;
    from: string;
    to: string;
}
export interface IndicatorResult {
    symbol: string;
    exchange: ExchangeCode;
    type: IndicatorType;
    timestamps: string[];
    values: IndicatorSeries | MacdResult;
    latest: number | {
        macd: number | null;
        signal: number | null;
        histogram: number | null;
    } | null;
}
export declare const indicatorsService: {
    compute(req: IndicatorRequest): Promise<IndicatorResult | null>;
};
