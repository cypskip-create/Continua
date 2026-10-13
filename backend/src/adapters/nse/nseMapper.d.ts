/**
 * Pure functions: NSE raw shapes → Continua standard schema. This is
 * where provider-specific quirks get absorbed — field name differences,
 * enum casing, unit differences (e.g. market cap in millions vs. absolute),
 * timezone normalization (NSE feed times are EAT, we store UTC). Nothing
 * here should ever be imported outside the NSE adapter folder.
 */
import type { NseRawSecurity, NseRawQuote, NseRawCandle, NseRawCompanyProfile, NseRawFinancialPeriod, NseRawCorporateAction, NseRawEarningsEvent, NseRawOwnership } from "./nseRawTypes.js";
import type { Security, Company, Sector, Quote, Candle, FinancialPeriod, IncomeStatement, BalanceSheet, CashFlowStatement, CorporateAction, EarningsEvent, OwnershipRecord } from "../../types/market.js";
import type { FundamentalsBundle } from "../types.js";
/** Stable natural id — used as the Continua-internal identifier
 *  throughout the pipeline. Simple, deterministic, human-debuggable. */
export declare const securityId: (symbol: string) => string;
export declare const companyId: (symbol: string) => string;
export declare function mapSecurity(raw: NseRawSecurity): Security;
export declare function mapSector(raw: NseRawSecurity): Sector;
export declare function mapCompany(raw: NseRawSecurity, profile: NseRawCompanyProfile | null): Company;
export declare function mapQuote(raw: NseRawQuote): Quote;
export declare function mapCandle(raw: NseRawCandle): Candle;
export declare function mapFinancials(raw: NseRawFinancialPeriod): {
    period: FinancialPeriod;
    income: IncomeStatement;
    balance: BalanceSheet;
    cashFlow: CashFlowStatement;
};
export declare function mapFundamentalsBundle(security: NseRawSecurity, profile: NseRawCompanyProfile | null, financials: NseRawFinancialPeriod): FundamentalsBundle;
export declare function mapCorporateAction(raw: NseRawCorporateAction, id: string): CorporateAction;
export declare function mapEarningsEvent(raw: NseRawEarningsEvent, id: string): EarningsEvent;
export declare function mapOwnership(raw: NseRawOwnership): OwnershipRecord;
