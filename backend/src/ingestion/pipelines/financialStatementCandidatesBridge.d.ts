export interface FinancialCandidatesBridgeSummary {
    extractionsProcessed: number;
    candidatesCreated: number;
    resolved: number;
    unresolved: number;
    failed: number;
}
export declare function runFinancialStatementCandidatesBridge(exchange?: string, batchSize?: number): Promise<FinancialCandidatesBridgeSummary>;
