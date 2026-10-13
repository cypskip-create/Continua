import { z } from "zod";
export declare const CalendarDate: z.ZodEffects<z.ZodString, string, string>;
export declare const AdvancedResearchSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"factor-risk">;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    basis: z.ZodEnum<["price", "total-return"]>;
    factorSources: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodEffects<z.ZodString, string, string>>, Record<string, string>, Record<string, string>>;
    observations: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        portfolioReturn: z.ZodNumber;
        factors: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodNumber>, Record<string, number>, Record<string, number>>;
    }, "strict", z.ZodTypeAny, {
        date: string;
        portfolioReturn: number;
        factors: Record<string, number>;
    }, {
        date: string;
        portfolioReturn: number;
        factors: Record<string, number>;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    sourceUrl: string;
    kind: "factor-risk";
    basis: "price" | "total-return";
    factorSources: Record<string, string>;
    observations: {
        date: string;
        portfolioReturn: number;
        factors: Record<string, number>;
    }[];
}, {
    sourceUrl: string;
    kind: "factor-risk";
    basis: "price" | "total-return";
    factorSources: Record<string, string>;
    observations: {
        date: string;
        portfolioReturn: number;
        factors: Record<string, number>;
    }[];
}>, z.ZodObject<{
    actions: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        splitRatio: z.ZodOptional<z.ZodNumber>;
        dividend: z.ZodOptional<z.ZodNumber>;
        sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        date: string;
        sourceUrl: string;
        dividend?: number | undefined;
        splitRatio?: number | undefined;
    }, {
        date: string;
        sourceUrl: string;
        dividend?: number | undefined;
        splitRatio?: number | undefined;
    }>, "many">;
    actionCoverageConfirmed: z.ZodLiteral<true>;
    points: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        close: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        date: string;
        close: number;
    }, {
        date: string;
        close: number;
    }>, "many">;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    additionalSourceUrls: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    kind: z.ZodLiteral<"total-return">;
}, "strict", z.ZodTypeAny, {
    sourceUrl: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "total-return";
    actions: {
        date: string;
        sourceUrl: string;
        dividend?: number | undefined;
        splitRatio?: number | undefined;
    }[];
    actionCoverageConfirmed: true;
    additionalSourceUrls?: string[] | undefined;
}, {
    sourceUrl: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "total-return";
    actions: {
        date: string;
        sourceUrl: string;
        dividend?: number | undefined;
        splitRatio?: number | undefined;
    }[];
    actionCoverageConfirmed: true;
    additionalSourceUrls?: string[] | undefined;
}>, z.ZodObject<{
    benchmark: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        close: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        date: string;
        close: number;
    }, {
        date: string;
        close: number;
    }>, "many">;
    benchmarkSourceUrl: z.ZodEffects<z.ZodString, string, string>;
    basis: z.ZodEnum<["price", "total-return"]>;
    points: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        close: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        date: string;
        close: number;
    }, {
        date: string;
        close: number;
    }>, "many">;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    additionalSourceUrls: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    kind: z.ZodLiteral<"benchmark">;
}, "strict", z.ZodTypeAny, {
    sourceUrl: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "benchmark";
    basis: "price" | "total-return";
    benchmark: {
        date: string;
        close: number;
    }[];
    benchmarkSourceUrl: string;
    additionalSourceUrls?: string[] | undefined;
}, {
    sourceUrl: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "benchmark";
    basis: "price" | "total-return";
    benchmark: {
        date: string;
        close: number;
    }[];
    benchmarkSourceUrl: string;
    additionalSourceUrls?: string[] | undefined;
}>, z.ZodObject<{
    paths: z.ZodNumber;
    horizon: z.ZodNumber;
    seed: z.ZodNumber;
    blockSize: z.ZodNumber;
    points: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        close: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        date: string;
        close: number;
    }, {
        date: string;
        close: number;
    }>, "many">;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    additionalSourceUrls: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    kind: z.ZodLiteral<"bootstrap">;
}, "strict", z.ZodTypeAny, {
    sourceUrl: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "bootstrap";
    horizon: number;
    paths: number;
    seed: number;
    blockSize: number;
    additionalSourceUrls?: string[] | undefined;
}, {
    sourceUrl: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "bootstrap";
    horizon: number;
    paths: number;
    seed: number;
    blockSize: number;
    additionalSourceUrls?: string[] | undefined;
}>, z.ZodObject<{
    start: z.ZodEffects<z.ZodString, string, string>;
    end: z.ZodEffects<z.ZodString, string, string>;
    points: z.ZodArray<z.ZodObject<{
        date: z.ZodEffects<z.ZodString, string, string>;
        close: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        date: string;
        close: number;
    }, {
        date: string;
        close: number;
    }>, "many">;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    additionalSourceUrls: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    kind: z.ZodLiteral<"replay">;
}, "strict", z.ZodTypeAny, {
    sourceUrl: string;
    end: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "replay";
    start: string;
    additionalSourceUrls?: string[] | undefined;
}, {
    sourceUrl: string;
    end: string;
    points: {
        date: string;
        close: number;
    }[];
    kind: "replay";
    start: string;
    additionalSourceUrls?: string[] | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"cross-asset">;
    currency: z.ZodLiteral<"KES">;
    positions: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        assetClass: z.ZodEnum<["equity", "bond", "cash", "futures-collateral"]>;
        value: z.ZodNumber;
        asOf: z.ZodEffects<z.ZodString, string, string>;
        sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        value: number;
        sourceUrl: string;
        asOf: string;
        name: string;
        assetClass: "equity" | "bond" | "cash" | "futures-collateral";
    }, {
        value: number;
        sourceUrl: string;
        asOf: string;
        name: string;
        assetClass: "equity" | "bond" | "cash" | "futures-collateral";
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    currency: "KES";
    kind: "cross-asset";
    positions: {
        value: number;
        sourceUrl: string;
        asOf: string;
        name: string;
        assetClass: "equity" | "bond" | "cash" | "futures-collateral";
    }[];
}, {
    currency: "KES";
    kind: "cross-asset";
    positions: {
        value: number;
        sourceUrl: string;
        asOf: string;
        name: string;
        assetClass: "equity" | "bond" | "cash" | "futures-collateral";
    }[];
}>]>;
export declare function advancedResearch(input: z.infer<typeof AdvancedResearchSchema>, now?: Date): {
    sources: string[];
    basis: "price" | "total-return";
    intercept: number | undefined;
    exposures: {
        factor: string;
        beta: number | undefined;
    }[];
    trainingObservations: number;
    holdoutObservations: number;
    trainingR2: number | null;
    holdoutR2: number | null;
    holdoutRmsePercent: number;
    historicalVaR95Percent: number;
    expectedShortfall95Percent: number;
    holdoutBreachCount: number;
    holdoutBreachRatePercent: number;
    curve: {
        date: string;
        index: number;
        benchmark: number;
    }[];
    methodology: string;
    generatedAt: string;
    kind: "factor-risk" | "total-return" | "benchmark" | "bootstrap" | "replay" | "cross-asset";
    inputVerification: string;
    methodVersion: string;
} | {
    totalValue: number;
    currency: string;
    asOf: string;
    positions: {
        weightPercent: number;
        value: number;
        sourceUrl: string;
        asOf: string;
        name: string;
        assetClass: "equity" | "bond" | "cash" | "futures-collateral";
    }[];
    methodology: string;
    generatedAt: string;
    kind: "factor-risk" | "total-return" | "benchmark" | "bootstrap" | "replay" | "cross-asset";
    inputVerification: string;
    methodVersion: string;
} | {
    curve: {
        date: string;
        index: number;
    }[];
    sources: string[];
    totalReturnPercent: number;
    methodology: string;
    generatedAt: string;
    kind: "factor-risk" | "total-return" | "benchmark" | "bootstrap" | "replay" | "cross-asset";
    inputVerification: string;
    methodVersion: string;
} | {
    curve: {
        date: string;
        index: number;
    }[];
    sources: string[];
    start: string;
    end: string;
    returnPercent: number;
    maxDrawdownPercent: number;
    methodology: string;
    generatedAt: string;
    kind: "factor-risk" | "total-return" | "benchmark" | "bootstrap" | "replay" | "cross-asset";
    inputVerification: string;
    methodVersion: string;
} | {
    sources: string[];
    basis: "price" | "total-return";
    observations: number;
    activeReturnPercent: number;
    trackingErrorPercent: number;
    informationRatio: number | null;
    beta: number | null;
    curve: {
        date: string;
        index: number;
        benchmark: number;
    }[];
    methodology: string;
    generatedAt: string;
    kind: "factor-risk" | "total-return" | "benchmark" | "bootstrap" | "replay" | "cross-asset";
    inputVerification: string;
    methodVersion: string;
} | {
    sources: string[];
    observations: number;
    seed: number;
    blockSize: number;
    horizon: number;
    paths: number;
    p05ReturnPercent: number;
    medianReturnPercent: number;
    p95ReturnPercent: number;
    curve: {
        date: string;
        index: number;
        band: number[];
    }[];
    methodology: string;
    generatedAt: string;
    kind: "factor-risk" | "total-return" | "benchmark" | "bootstrap" | "replay" | "cross-asset";
    inputVerification: string;
    methodVersion: string;
};
