export type AnnualValuationPeriod = {
    fiscalYear: number;
    periodEnd: string;
    reportedAt: string;
    eps?: number | null;
    netIncome?: number | null;
    sharesOutstanding?: number | null;
    totalEquity?: number | null;
    revenue?: number | null;
    sourceUrls?: string[] | null;
};
export type ValuationRatio = 'pe' | 'pb' | 'ps';
export declare function annualRatioAt(periods: AnnualValuationPeriod[], price: number, at: string, ratio: ValuationRatio): {
    ratio: number | null;
    price: number;
    fiscalYear: number | null;
    reportedAt: string | null;
    denominator: number | null;
    sourceUrls: string[];
};
