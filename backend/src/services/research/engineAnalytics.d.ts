export interface FinancialRow {
    basis?: 'publisher_observation';
    sourceUrls?: string[] | null;
    fiscalYear: number;
    fiscalQuarter?: number | null;
    periodEnd?: string;
    reportedAt?: string;
    currency?: string;
    revenue?: number | null;
    netIncome?: number | null;
    eps?: number | null;
    totalAssets?: number | null;
    totalLiabilities?: number | null;
    totalEquity?: number | null;
    operatingCashFlow?: number | null;
    freeCashFlow?: number | null;
    totalDebt?: number | null;
    currentAssets?: number | null;
    currentLiabilities?: number | null;
    sharesOutstanding?: number | null;
}
export declare const finite: (n: unknown) => n is number;
export declare function analyzeFinancials(rows: FinancialRow[], sector: string): {
    period: number | null;
    metrics: {
        revenueGrowth: number | null;
        earningsGrowth: number | null;
        dilution: number | null;
        cashConversion: number | null;
        freeCashFlowMargin: number | null;
        debtToEquity: number | null;
        currentRatio: number | null;
        returnOnAssets: number | null;
    };
    findings: string[];
    sectorNote: string;
    missing: string[];
};
export declare function dataQuality(quote: {
    timestamp?: string;
    source?: string;
} | null, rows: FinancialRow[], now?: Date): {
    quoteAsOf: string | null;
    quoteSource: string | null;
    periodEnd: string | null;
    filedAt: string | null;
    financialCoverage: {
        years: number[];
        missingYears: number[];
        sourceBackedYears: number[];
    };
    warnings: string[];
    priceAdjustmentBasis: string;
};
export interface ResearchState {
    fiscalYear: number | null;
    revenue: number | null;
    netIncome: number | null;
    debtToEquity: number | null;
    fairValue: number | null;
    newsIds: string[];
    ownership: {
        name: string;
        percent: number;
    }[];
}
export declare function fingerprint(state: ResearchState): string;
export declare function changesBetween(previous: ResearchState | null, current: ResearchState): {
    baseline: boolean;
    changes: {
        topic: string;
        text: string;
        material: boolean;
    }[];
};
export declare function scenarios(row: FinancialRow | undefined): {
    name: string;
    growthPercent: number;
    revenue: number | null;
    netIncome: number | null;
    assumption: string;
}[];
