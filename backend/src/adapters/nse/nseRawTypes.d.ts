/**
 * Shapes as they'd arrive from an NSE data provider — deliberately NOT the
 * same field names as our standard schema. This is the whole point of the
 * adapter boundary: whatever a real licensed NSE feed's field names/casing/
 * quirks turn out to be, only nseMapper.ts needs to change to match them.
 * Nothing downstream of the adapter ever sees these shapes.
 */
export interface NseRawSecurity {
    Symbol: string;
    ISIN?: string;
    CompanyName: string;
    Sector: string;
    Industry: string;
    ListingDate?: string;
    TradingStatus: "ACTIVE" | "SUSPENDED" | "HALTED" | "DELISTED";
}
export interface NseRawQuote {
    Symbol: string;
    LastTradedPrice: number;
    Open: number;
    High: number;
    Low: number;
    PrevClose: number;
    Change: number;
    ChangePct: number;
    Volume: number;
    Bid?: number;
    Ask?: number;
    MarketCapMn?: number;
    Currency: string;
    TradingStatus: "ACTIVE" | "SUSPENDED" | "HALTED" | "DELISTED";
    EventTimestamp: string;
}
export interface NseRawCandle {
    Symbol: string;
    Interval: "1MIN" | "5MIN" | "15MIN" | "1HR" | "1D" | "1W" | "1MO" | "1Y";
    BarTime: string;
    O: number;
    H: number;
    L: number;
    C: number;
    V: number;
}
export interface NseRawCompanyProfile {
    Symbol: string;
    Description?: string;
    Headquarters?: string;
    ChiefExecutive?: string;
    EmployeeCount?: string;
    FoundedYear?: string;
    Website?: string;
}
export interface NseRawFinancialPeriod {
    Symbol: string;
    PeriodType: "ANNUAL" | "QUARTERLY";
    FiscalYear: number;
    FiscalQuarter?: number;
    PeriodEndDate: string;
    ReportedDate: string;
    Currency: string;
    Revenue: number;
    CostOfRevenue?: number;
    GrossProfit?: number;
    OperatingExpenses?: number;
    OperatingIncome?: number;
    NetIncome: number;
    EPS: number;
    DilutedEPS?: number;
    EBITDA?: number;
    TotalAssets: number;
    TotalLiabilities: number;
    TotalEquity: number;
    Cash?: number;
    TotalDebt?: number;
    CurrentAssets?: number;
    CurrentLiabilities?: number;
    SharesOutstanding?: number;
    OperatingCashFlow: number;
    InvestingCashFlow?: number;
    FinancingCashFlow?: number;
    FreeCashFlow?: number;
    Capex?: number;
}
export interface NseRawCorporateAction {
    Symbol: string;
    ActionType: "DIVIDEND" | "SPLIT" | "BONUS" | "RIGHTS" | "BUYBACK" | "MERGER" | "ACQUISITION" | "SUSPENSION" | "HALT";
    AnnouncedDate: string;
    ExDate?: string;
    RecordDate?: string;
    PayDate?: string;
    EffectiveDate?: string;
    Status: "ANNOUNCED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
    Payload: Record<string, unknown>;
}
export interface NseRawEarningsEvent {
    Symbol: string;
    FiscalYear: number;
    FiscalQuarter?: number;
    ExpectedDate?: string;
    ReportedDate?: string;
    EpsEstimate?: number;
    EpsActual?: number;
    RevenueEstimate?: number;
    RevenueActual?: number;
}
export interface NseRawOwnership {
    Symbol: string;
    HolderName: string;
    HolderType: "INSIDER" | "INSTITUTION" | "GOVERNMENT" | "PUBLIC" | "OTHER";
    SharesHeld: number;
    PercentHeld: number;
    AsOfDate: string;
}
