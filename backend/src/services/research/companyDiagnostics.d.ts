import type { FinancialRow } from './engineAnalytics.js';
export declare function companyDiagnostics(history: FinancialRow[]): {
    trends: {
        year: number;
        netMargin: number | null;
        roe: number | null;
        cashConversion: number | null;
        accrualsToAssets: number | null;
        sourceUrls: string[];
        reportedAt: string | null;
    }[];
    checks: {
        id: string;
        label: string;
        result: "pass" | "flag" | "unknown";
        reason: string;
    }[];
    knownChecks: number;
    totalChecks: number;
    evidence: {
        year: number;
        field: string;
        value: number;
        periodEnd: string | null;
        availableAt: string | null;
        sourceUrls: string[];
        basis: string;
    }[];
    methodology: string;
};
