import { type EnginePreferences } from "../../services/research/enginePreferences.js";
import { type ResearchState } from "../../services/research/engineAnalytics.js";
export declare const engineRepository: {
    preferences(userId: string): Promise<EnginePreferences>;
    savePreferences(userId: string, settings: EnginePreferences): Promise<{
        interests: {
            symbol: string;
            exchange: string;
            visits: number;
            lastSeen?: string | undefined;
        }[];
        goal: "Balanced" | "Income" | "Growth" | "Capital preservation" | "Short-term trading";
        horizon: "under_1_year" | "1_to_5_years" | "over_5_years";
        experience: "beginner" | "intermediate" | "experienced";
        riskComfort: "unspecified" | "lower" | "moderate" | "higher";
        incomeNeeds: "none" | "occasional" | "regular";
        sectors: string[];
        notifications: boolean;
        learnInterests: boolean;
    }>;
    recordInterest(userId: string, symbol: string, exchange: string, reset?: boolean): Promise<{
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
    }>;
    observe(securityId: string, state: ResearchState): Promise<{
        fingerprint: string;
        comparedAsOf: Date | null;
        baseline: boolean;
        changes: {
            topic: string;
            text: string;
            material: boolean;
        }[];
    }>;
    rules(userId: string): Promise<any[]>;
    saveRule(userId: string, rule: {
        exchange: string;
        symbol: string;
        kind: string;
        threshold?: number;
        enabled: boolean;
    }): Promise<any>;
    deleteRule(userId: string, id: string): Promise<void>;
    reserveAi(userId: string, model: string, amount: number, monthlyCap: number, userDailyLimit: number): Promise<string>;
    finishAi(id: string, status: "complete" | "failed", input: number | null, output: number | null): Promise<void>;
    aiUsage(userId: string): Promise<any>;
};
