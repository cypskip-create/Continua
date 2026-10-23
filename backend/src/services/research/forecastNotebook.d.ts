import type { z } from "zod/v3";
export declare const ForecastCreateSchema: z.ZodEffects<z.ZodObject<{
    symbol: z.ZodString;
    question: z.ZodString;
    rules: z.ZodString;
    deadline: z.ZodString;
    probability: z.ZodNumber;
    rationale: z.ZodString;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    question: string;
    rules: string;
    deadline: string;
    probability: number;
    rationale: string;
}, {
    symbol: string;
    question: string;
    rules: string;
    deadline: string;
    probability: number;
    rationale: string;
}>, {
    symbol: string;
    question: string;
    rules: string;
    deadline: string;
    probability: number;
    rationale: string;
}, {
    symbol: string;
    question: string;
    rules: string;
    deadline: string;
    probability: number;
    rationale: string;
}>;
export declare const ForecastRevisionSchema: z.ZodObject<{
    probability: z.ZodNumber;
    rationale: z.ZodString;
}, "strict", z.ZodTypeAny, {
    probability: number;
    rationale: string;
}, {
    probability: number;
    rationale: string;
}>;
export declare const ForecastResolutionSchema: z.ZodObject<{
    outcome: z.ZodEnum<["yes", "no", "void"]>;
    sourceUrl: z.ZodEffects<z.ZodString, string, string>;
    note: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sourceUrl: string;
    note: string;
    outcome: "yes" | "void" | "no";
}, {
    sourceUrl: string;
    note: string;
    outcome: "yes" | "void" | "no";
}>;
export type ForecastRevision = {
    at: string;
    probability: number;
    rationale: string;
};
export interface NotebookForecast {
    id: string;
    symbol: string;
    question: string;
    rules: string;
    deadline: string;
    probability: number;
    revisions: ForecastRevision[];
    status: "open" | "resolved" | "void";
    outcome: boolean | null;
    resolution_source: string | null;
    resolution_note: string | null;
    created_at: string;
    resolved_at: string | null;
}
export declare function canReviseForecast(row: Pick<NotebookForecast, "deadline" | "status">, now?: Date): boolean;
export declare function privateCalibration(rows: NotebookForecast[]): {
    resolvedCount: number;
    initialBrier: number | null;
    latestBrier: number | null;
    bins: {
        range: string;
        count: number;
        meanProbability: number | null;
        observedYesRate: number | null;
    }[];
    methodology: string;
    warning: string | null;
};
