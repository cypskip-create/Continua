export interface AfxQuote {
    symbol: string;
    companyName: string | null;
    lastTradedPrice: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    prevClose: number | null;
    change: number | null;
    changePct: number | null;
    volume: number | null;
    currency: "KES";
    asOfTradingDay: string | null;
}
export interface AfxSecurityProfile {
    symbol: string;
    companyName: string | null;
    isin: string | null;
    sector: string | null;
    industry: string | null;
    marketCapMn: number | null;
    sharesOutstandingM: number | null;
    eps: number | null;
    peRatio: number | null;
    dividendPerShare: number | null;
    dividendYieldPct: number | null;
    description: string | null;
    headquarters: string | null;
    website: string | null;
}
export interface AfxDailyBar {
    date: string;
    close: number;
    volume: number | null;
}
export declare function parseAfxQuote(html: string, symbol: string): AfxQuote;
export declare function parseAfxSecurityProfile(html: string, symbol: string): AfxSecurityProfile;
/**
 * The "last 10 trading days" table: Date | Volume | Close | Change |
 * Change%. Returns bars in ascending date order (the page lists them
 * newest-first).
 */
export declare function parseAfxDailyHistory(html: string): AfxDailyBar[];
