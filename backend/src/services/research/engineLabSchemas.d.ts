import { z } from 'zod';
export declare const StressSchema: z.ZodEffects<z.ZodObject<{
    marketShock: z.ZodNumber;
    sectorShocks: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    marketShock: number;
    sectorShocks: Record<string, number>;
}, {
    marketShock: number;
    sectorShocks?: Record<string, number> | undefined;
}>, {
    marketShock: number;
    sectorShocks: Record<string, number>;
}, {
    marketShock: number;
    sectorShocks?: Record<string, number> | undefined;
}>;
export declare const BondLabSchema: z.ZodEffects<z.ZodObject<{
    settlement: z.ZodEffects<z.ZodString, string, string>;
    previousCoupon: z.ZodEffects<z.ZodString, string, string>;
    nextCoupon: z.ZodEffects<z.ZodString, string, string>;
    couponPerPeriod: z.ZodNumber;
    yieldPercent: z.ZodNumber;
    frequency: z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<4>]>;
    cashFlows: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        amount: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        date: string;
        amount: number;
    }, {
        date: string;
        amount: number;
    }>, "many">;
    shockBps: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    settlement: string;
    previousCoupon: string;
    nextCoupon: string;
    couponPerPeriod: number;
    yieldPercent: number;
    frequency: 2 | 1 | 4;
    cashFlows: {
        date: string;
        amount: number;
    }[];
    shockBps: number;
}, {
    settlement: string;
    previousCoupon: string;
    nextCoupon: string;
    couponPerPeriod: number;
    yieldPercent: number;
    frequency: 2 | 1 | 4;
    cashFlows: {
        date: string;
        amount: number;
    }[];
    shockBps: number;
}>, {
    settlement: string;
    previousCoupon: string;
    nextCoupon: string;
    couponPerPeriod: number;
    yieldPercent: number;
    frequency: 2 | 1 | 4;
    cashFlows: {
        date: string;
        amount: number;
    }[];
    shockBps: number;
}, {
    settlement: string;
    previousCoupon: string;
    nextCoupon: string;
    couponPerPeriod: number;
    yieldPercent: number;
    frequency: 2 | 1 | 4;
    cashFlows: {
        date: string;
        amount: number;
    }[];
    shockBps: number;
}>;
export declare const FuturesLabSchema: z.ZodObject<{
    entry: z.ZodNumber;
    settlement: z.ZodNumber;
    multiplier: z.ZodNumber;
    contracts: z.ZodNumber;
    side: z.ZodEnum<["long", "short"]>;
    margin: z.ZodNumber;
    expiry: z.ZodEffects<z.ZodString, string, string>;
    asOf: z.ZodEffects<z.ZodString, string, string>;
    shockPercent: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    asOf: string;
    expiry: string;
    settlement: number;
    entry: number;
    multiplier: number;
    contracts: number;
    side: "long" | "short";
    margin: number;
    shockPercent: number;
}, {
    asOf: string;
    expiry: string;
    settlement: number;
    entry: number;
    multiplier: number;
    contracts: number;
    side: "long" | "short";
    margin: number;
    shockPercent: number;
}>;
