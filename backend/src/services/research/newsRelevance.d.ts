/** Conservative, auditable issuer relevance. No inferred price direction. */
export interface NewsIssuer {
    securityId: string;
    symbol: string;
    companyName: string;
}
export interface IssuerEvidence {
    securityId: string;
    symbol: string;
    companyName: string;
    evidence: string;
    basis: "headline" | "article";
    relationship: "issuer" | "brand";
}
export declare function articleEvidenceText(headline: string, raw: string): string;
export declare function analyzeNewsIssuers(headline: string, raw: string, directory: NewsIssuer[]): IssuerEvidence[];
