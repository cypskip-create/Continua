export interface DeadLetterRecord {
    exchange: string;
    dataset: "price" | "candle" | "financials" | "corporate_action" | "earnings" | "ownership" | "index" | "announcement" | "financial_statement_candidate" | "news";
    symbol: string | null;
    payload: unknown;
    error: string;
}
/** Records that failed validation or exhausted their retries — preserved
 *  for manual review instead of only appearing as a truncated string in
 *  ingestion_logs.errors. This is what "dead-letter handling" in the spec
 *  means in practice: nothing silently vanishes, even when it can't be
 *  automatically processed. */
export declare const deadLetterRepository: {
    record(entry: DeadLetterRecord): Promise<void>;
    recordBatch(entries: DeadLetterRecord[]): Promise<void>;
    recent(limit?: number): Promise<any[]>;
};
