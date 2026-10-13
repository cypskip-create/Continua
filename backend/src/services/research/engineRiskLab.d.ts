/** Independently implemented research calculations, not investment advice or
 * proprietary institutional models. All shocks are explicit assumptions. */
export interface StressPosition {
    symbol: string;
    sector: string;
    value: number;
    asOf?: string | null;
}
export declare function stressPortfolio(positions: StressPosition[], marketShock: number, sectorShocks?: Record<string, number>): {
    totalValue: number;
    pnl: number;
    stressedValue: number;
    returnPercent: number | null;
    contributions: {
        shock: number;
        pnl: number;
        stressedValue: number;
        symbol: string;
        sector: string;
        value: number;
        asOf?: string | null;
    }[];
    assumptions: {
        marketShock: number;
        sectorShocks: Record<string, number>;
    };
    methodology: string;
};
export declare function riskContributions(returns: Record<string, number[]>, weights: Record<string, number>): {
    coveredWeight: number;
    observations: number;
    contributions: {
        symbol: string;
        weight: number;
        varianceContribution: number;
        riskShare: number;
    }[];
    historicalVaR95: number | null;
    expectedShortfall95: number | null;
    tailObservations: number;
    methodology: string;
} | null;
export interface DatedCashFlow {
    date: string;
    amount: number;
}
export interface BondLabInput {
    settlement: string;
    previousCoupon: string;
    nextCoupon: string;
    couponPerPeriod: number;
    yieldPercent: number;
    frequency: number;
    cashFlows: DatedCashFlow[];
    shockBps: number;
}
export declare function bondRisk(input: BondLabInput): {
    dirtyPrice: number;
    accruedInterest: number;
    cleanPrice: number;
    modifiedDuration: number;
    convexity: number;
    dv01: number;
    stressedDirtyPrice: number;
    pnl: number;
    approximatePnl: number;
    cashFlows: {
        presentValue: number;
        date: string;
        amount: number;
    }[];
    basis: string;
};
export interface FuturesLabInput {
    entry: number;
    settlement: number;
    multiplier: number;
    contracts: number;
    side: 'long' | 'short';
    margin: number;
    expiry: string;
    asOf: string;
    shockPercent: number;
}
export declare function futuresRisk(input: FuturesLabInput): {
    notional: number;
    pnl: number;
    stressPnl: number;
    marginBalance: number;
    stressedMarginBalance: number;
    effectiveLeverage: number | null;
    expired: boolean;
    basis: string;
};
export interface ReturnPoint {
    date: string;
    close: number;
}
export interface VerifiedAction {
    date: string;
    splitRatio?: number;
    dividend?: number;
    sourceUrl: string;
}
export declare function totalReturnSeries(points: ReturnPoint[], actions: VerifiedAction[]): {
    date: string;
    index: number;
}[];
