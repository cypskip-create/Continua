import type { z } from "zod/v3";
export declare const EnginePreferencesSchema: z.ZodObject<{
    goal: z.ZodDefault<z.ZodEnum<["Balanced", "Income", "Growth", "Capital preservation", "Short-term trading"]>>;
    horizon: z.ZodDefault<z.ZodEnum<["under_1_year", "1_to_5_years", "over_5_years"]>>;
    experience: z.ZodDefault<z.ZodEnum<["beginner", "intermediate", "experienced"]>>;
    riskComfort: z.ZodDefault<z.ZodEnum<["unspecified", "lower", "moderate", "higher"]>>;
    incomeNeeds: z.ZodDefault<z.ZodEnum<["none", "occasional", "regular"]>>;
    sectors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notifications: z.ZodDefault<z.ZodBoolean>;
    learnInterests: z.ZodDefault<z.ZodBoolean>;
    interests: z.ZodDefault<z.ZodArray<z.ZodObject<{
        symbol: z.ZodString;
        exchange: z.ZodString;
        visits: z.ZodNumber;
        lastSeen: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symbol: string;
        exchange: string;
        visits: number;
        lastSeen?: string | undefined;
    }, {
        symbol: string;
        exchange: string;
        visits: number;
        lastSeen?: string | undefined;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    goal: "Balanced" | "Income" | "Growth" | "Capital preservation" | "Short-term trading";
    horizon: "under_1_year" | "1_to_5_years" | "over_5_years";
    experience: "beginner" | "intermediate" | "experienced";
    riskComfort: "unspecified" | "lower" | "moderate" | "higher";
    incomeNeeds: "none" | "occasional" | "regular";
    sectors: string[];
    notifications: boolean;
    learnInterests: boolean;
    interests: {
        symbol: string;
        exchange: string;
        visits: number;
        lastSeen?: string | undefined;
    }[];
}, {
    goal?: "Balanced" | "Income" | "Growth" | "Capital preservation" | "Short-term trading" | undefined;
    horizon?: "under_1_year" | "1_to_5_years" | "over_5_years" | undefined;
    experience?: "beginner" | "intermediate" | "experienced" | undefined;
    riskComfort?: "unspecified" | "lower" | "moderate" | "higher" | undefined;
    incomeNeeds?: "none" | "occasional" | "regular" | undefined;
    sectors?: string[] | undefined;
    notifications?: boolean | undefined;
    learnInterests?: boolean | undefined;
    interests?: {
        symbol: string;
        exchange: string;
        visits: number;
        lastSeen?: string | undefined;
    }[] | undefined;
}>;
export type EnginePreferences = z.infer<typeof EnginePreferencesSchema>;
export declare const defaultPreferences: () => {
    goal: "Balanced" | "Income" | "Growth" | "Capital preservation" | "Short-term trading";
    horizon: "under_1_year" | "1_to_5_years" | "over_5_years";
    experience: "beginner" | "intermediate" | "experienced";
    riskComfort: "unspecified" | "lower" | "moderate" | "higher";
    incomeNeeds: "none" | "occasional" | "regular";
    sectors: string[];
    notifications: boolean;
    learnInterests: boolean;
    interests: {
        symbol: string;
        exchange: string;
        visits: number;
        lastSeen?: string | undefined;
    }[];
};
export declare function recordInterest(settings: EnginePreferences, symbol: string, exchange: string, reset?: boolean, now?: Date): EnginePreferences;
export declare function researchRecommendations(settings: EnginePreferences, now?: Date): {
    tools: string[];
    companies: {
        symbol: string;
        exchange: string;
        reason: string;
    }[];
    reason: string;
    methodology: string;
};
