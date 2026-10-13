const EXCHANGE = "NSE";
/** Stable natural id — used as the Continua-internal identifier
 *  throughout the pipeline. Simple, deterministic, human-debuggable. */
export const securityId = (symbol) => `${EXCHANGE}:${symbol}`;
export const companyId = (symbol) => `${EXCHANGE}:company:${symbol}`;
const periodId = (symbol, fy, fq) => `${EXCHANGE}:period:${symbol}:${fy}${fq ? `Q${fq}` : ""}`;
/** Slug used as the sector's stable id — deliberately mechanical (trim,
 *  lowercase, hyphenate) rather than a judgment call about canonical naming.
 *  Cross-exchange canonicalization of sector NAMES (e.g. reconciling minor
 *  spelling/casing drift between providers) belongs in the normalization
 *  layer, not here — this only needs to be a consistent id for NSE's own
 *  sector strings. */
const sectorId = (rawSectorName) => rawSectorName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function mapStatus(s) {
    switch (s) {
        case "ACTIVE": return "active";
        case "SUSPENDED": return "suspended";
        case "HALTED": return "halted";
        case "DELISTED": return "delisted";
    }
}
function mapInterval(i) {
    const map = {
        "1MIN": "1m", "5MIN": "5m", "15MIN": "15m", "1HR": "1h",
        "1D": "1d", "1W": "1w", "1MO": "1M", "1Y": "1y",
    };
    return map[i];
}
/** NSE feed timestamps are Africa/Nairobi (EAT, UTC+3) local time without
 *  an offset marker. Normalize explicitly rather than trusting Date parsing
 *  to guess right — this is exactly the kind of silent bug that corrupts
 *  charts three weeks later. */
function toUtcIso(eatLocalIso) {
    const hasOffset = /[zZ]|[+-]\d{2}:\d{2}$/.test(eatLocalIso);
    if (hasOffset)
        return new Date(eatLocalIso).toISOString();
    return new Date(`${eatLocalIso}+03:00`).toISOString();
}
export function mapSecurity(raw) {
    return {
        id: securityId(raw.Symbol),
        symbol: raw.Symbol,
        exchange: EXCHANGE,
        companyId: companyId(raw.Symbol),
        currency: "KES",
        status: mapStatus(raw.TradingStatus),
        isin: raw.ISIN,
        listedAt: raw.ListingDate,
    };
}
export function mapSector(raw) {
    return { id: sectorId(raw.Sector), name: raw.Sector.trim() };
}
export function mapCompany(raw, profile) {
    return {
        id: companyId(raw.Symbol),
        name: raw.CompanyName,
        description: profile?.Description,
        sectorId: sectorId(raw.Sector),
        headquarters: profile?.Headquarters,
        ceo: profile?.ChiefExecutive,
        employees: profile?.EmployeeCount,
        founded: profile?.FoundedYear,
        website: profile?.Website,
    };
}
export function mapQuote(raw) {
    return {
        securityId: securityId(raw.Symbol),
        symbol: raw.Symbol,
        exchange: EXCHANGE,
        lastPrice: raw.LastTradedPrice,
        open: raw.Open,
        high: raw.High,
        low: raw.Low,
        previousClose: raw.PrevClose,
        change: raw.Change,
        changePercent: raw.ChangePct,
        volume: raw.Volume,
        bid: raw.Bid,
        ask: raw.Ask,
        marketCap: raw.MarketCapMn != null ? raw.MarketCapMn * 1_000_000 : undefined,
        currency: raw.Currency,
        status: mapStatus(raw.TradingStatus),
        timestamp: toUtcIso(raw.EventTimestamp),
        source: "live",
    };
}
export function mapCandle(raw) {
    return {
        securityId: securityId(raw.Symbol),
        interval: mapInterval(raw.Interval),
        timestamp: toUtcIso(raw.BarTime),
        open: raw.O, high: raw.H, low: raw.L, close: raw.C, volume: raw.V,
    };
}
export function mapFinancials(raw) {
    const id = periodId(raw.Symbol, raw.FiscalYear, raw.FiscalQuarter);
    const period = {
        id, securityId: securityId(raw.Symbol),
        periodType: raw.PeriodType === "ANNUAL" ? "annual" : "quarterly",
        fiscalYear: raw.FiscalYear, fiscalQuarter: raw.FiscalQuarter,
        periodEnd: raw.PeriodEndDate, reportedAt: raw.ReportedDate,
        currency: raw.Currency,
    };
    const income = {
        periodId: id, revenue: raw.Revenue, costOfRevenue: raw.CostOfRevenue, grossProfit: raw.GrossProfit,
        operatingExpenses: raw.OperatingExpenses, operatingIncome: raw.OperatingIncome, netIncome: raw.NetIncome,
        eps: raw.EPS, dilutedEps: raw.DilutedEPS, ebitda: raw.EBITDA,
    };
    const balance = {
        periodId: id, totalAssets: raw.TotalAssets, totalLiabilities: raw.TotalLiabilities, totalEquity: raw.TotalEquity,
        cash: raw.Cash, totalDebt: raw.TotalDebt, currentAssets: raw.CurrentAssets,
        currentLiabilities: raw.CurrentLiabilities, sharesOutstanding: raw.SharesOutstanding,
    };
    const cashFlow = {
        periodId: id, operatingCashFlow: raw.OperatingCashFlow, investingCashFlow: raw.InvestingCashFlow,
        financingCashFlow: raw.FinancingCashFlow, freeCashFlow: raw.FreeCashFlow, capex: raw.Capex,
    };
    return { period, income, balance, cashFlow };
}
export function mapFundamentalsBundle(security, profile, financials) {
    const { period, income, balance, cashFlow } = mapFinancials(financials);
    return {
        security: mapSecurity(security), company: mapCompany(security, profile),
        sector: mapSector(security), period, income, balance, cashFlow,
    };
}
function mapActionType(t) {
    const map = {
        DIVIDEND: "dividend", SPLIT: "split", BONUS: "bonus_issue", RIGHTS: "rights_issue",
        BUYBACK: "buyback", MERGER: "merger", ACQUISITION: "acquisition",
        SUSPENSION: "suspension", HALT: "trading_halt",
    };
    return map[t];
}
function mapActionDetails(raw) {
    const p = raw.Payload;
    switch (raw.ActionType) {
        case "DIVIDEND":
            return { type: "dividend", amountPerShare: Number(p.AmountPerShare), currency: p.Currency ?? "KES", dividendType: p.DividendType ?? "final" };
        case "SPLIT":
            return { type: "split", ratioFrom: Number(p.RatioFrom ?? 1), ratioTo: Number(p.RatioTo ?? 1) };
        case "BONUS":
            return { type: "bonus_issue", ratioFrom: Number(p.RatioFrom ?? 1), ratioTo: Number(p.RatioTo ?? 1) };
        case "RIGHTS":
            return { type: "rights_issue", ratio: String(p.Ratio ?? ""), priceKes: Number(p.PriceKes ?? 0) };
        case "BUYBACK":
            return { type: "buyback", sharesTargeted: p.SharesTargeted != null ? Number(p.SharesTargeted) : undefined, amount: p.Amount != null ? Number(p.Amount) : undefined };
        case "MERGER":
            return { type: "merger", counterparty: String(p.Counterparty ?? ""), notes: p.Notes };
        case "ACQUISITION":
            return { type: "acquisition", counterparty: String(p.Counterparty ?? ""), notes: p.Notes };
        case "SUSPENSION":
            return { type: "suspension", reason: p.Reason };
        case "HALT":
            return { type: "trading_halt", reason: p.Reason };
    }
}
export function mapCorporateAction(raw, id) {
    return {
        id, securityId: securityId(raw.Symbol), type: mapActionType(raw.ActionType),
        announcedAt: raw.AnnouncedDate, exDate: raw.ExDate, recordDate: raw.RecordDate,
        payDate: raw.PayDate, effectiveDate: raw.EffectiveDate,
        details: mapActionDetails(raw),
        status: raw.Status.toLowerCase(),
    };
}
export function mapEarningsEvent(raw, id) {
    return {
        id, securityId: securityId(raw.Symbol), periodId: periodId(raw.Symbol, raw.FiscalYear, raw.FiscalQuarter),
        fiscalYear: raw.FiscalYear, fiscalQuarter: raw.FiscalQuarter,
        expectedDate: raw.ExpectedDate, reportedDate: raw.ReportedDate,
        epsEstimate: raw.EpsEstimate, epsActual: raw.EpsActual,
        revenueEstimate: raw.RevenueEstimate, revenueActual: raw.RevenueActual,
    };
}
export function mapOwnership(raw) {
    const typeMap = {
        INSIDER: "insider", INSTITUTION: "institution", GOVERNMENT: "government", PUBLIC: "public", OTHER: "other",
    };
    return {
        securityId: securityId(raw.Symbol), holderName: raw.HolderName, holderType: typeMap[raw.HolderType],
        sharesHeld: raw.SharesHeld, percentHeld: raw.PercentHeld, asOf: raw.AsOfDate,
    };
}
