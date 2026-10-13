import { z } from 'zod';
export declare const EarningsSensitivitySchema: z.ZodObject<{
    symbol: z.ZodString;
    years: z.ZodNumber;
    growthPercent: z.ZodNumber;
    exitPe: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    years: number;
    growthPercent: number;
    exitPe: number;
}, {
    symbol: string;
    years: number;
    growthPercent: number;
    exitPe: number;
}>;
export declare function earningsSensitivity(eps: number, price: number, years: number, growthPercent: number, exitPe: number): {
    cells: {
        growthPercent: number;
        exitPe: number;
        projectedEps: number;
        illustrativePrice: number;
        changePercent: number;
        annualizedPriceReturnPercent: number;
    }[];
    breakEvenGrowthPercent: number;
    assumptions: {
        eps: number;
        currentPrice: number;
        years: number;
        growthPercent: number;
        exitPe: number;
    };
    methodology: string;
};
