/** Transparent manual-data OLS research, never a proprietary risk model. */
export interface FactorPoint {
    date: string;
    portfolioReturn: number;
    factors: Record<string, number>;
}
export declare function factorResearch(points: FactorPoint[]): {
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
};
