export interface ResolvedEntity {
    companyId: string;
    securityId: string | null;
}
/**
 * Attempts to resolve a raw source-provided company name against
 * market.companies. Returns null (unresolved) unless there is exactly
 * one candidate after normalization — multiple partial matches are
 * treated as ambiguous, not resolved to "the best guess".
 */
export declare function resolveCompanyEntity(rawName: string, exchange: string): Promise<ResolvedEntity | null>;
