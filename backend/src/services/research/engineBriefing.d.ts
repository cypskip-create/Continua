export interface BriefingInputs {
    symbol: string;
    latest?: {
        fiscalYear: number;
        revenue: number | null;
        netIncome: number | null;
        eps: number | null;
    } | null;
    prior?: {
        fiscalYear: number;
        revenue: number | null;
        netIncome: number | null;
        eps: number | null;
    } | null;
    ratios?: {
        roe?: number | null;
        netMargin?: number | null;
        debtToEquity?: number | null;
        dividendYield?: number | null;
    } | null;
}
export declare function buildCompanyBriefing({ symbol, latest, prior, ratios }: BriefingInputs): {
    title: string;
    methodology: string;
    facts: string[];
    strengths: string[];
    risks: string[];
    coverage: string;
};
