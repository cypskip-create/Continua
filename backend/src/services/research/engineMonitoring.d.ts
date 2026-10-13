export declare const monitoringKinds: readonly ["material_change", "price_below", "price_above", "debt_above", "revenue_growth_below", "earnings_growth_below", "cash_conversion_below", "dividend_payout_above", "quote_age_above"];
export interface MonitorRule {
    kind: string;
    threshold: number | null;
    last_state: {
        triggered?: boolean;
        fingerprint?: string;
    } | null;
}
export declare function evaluateMonitor(rule: MonitorRule, state: {
    price: number | null;
    debt: number | null;
    growth: number | null;
    earningsGrowth?: number | null;
    cashConversion?: number | null;
    dividendPayout?: number | null;
    quoteAge?: number | null;
    fingerprint: string;
    material: boolean;
    quoteFresh: boolean;
}): {
    triggered: boolean;
    fingerprint: string;
    notify: boolean;
    unavailable?: undefined;
    value?: undefined;
} | {
    triggered: boolean;
    fingerprint: string;
    notify: boolean;
    unavailable: boolean;
    value: null;
} | {
    triggered: boolean;
    fingerprint: string;
    notify: boolean;
    unavailable: boolean;
    value: number;
};
