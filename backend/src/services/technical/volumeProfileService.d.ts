import type { ExchangeCode } from "../../config/index.js";
export interface VolumeProfileBucket {
    priceLow: number;
    priceHigh: number;
    priceMid: number;
    volume: number;
}
export interface VolumeProfileResult {
    symbol: string;
    exchange: ExchangeCode;
    from: string;
    to: string;
    buckets: VolumeProfileBucket[];
    pointOfControl: number;
    valueAreaLow: number;
    valueAreaHigh: number;
    totalVolume: number;
    caveat: string;
}
export declare const volumeProfileService: {
    compute(exchange: ExchangeCode, symbol: string, from: string, to: string, bucketCount?: number): Promise<VolumeProfileResult | null>;
};
