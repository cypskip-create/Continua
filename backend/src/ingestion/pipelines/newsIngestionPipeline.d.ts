export interface NewsBridgeSummary {
    processed: number;
    withMentions: number;
    withoutMentions: number;
    failed: number;
}
export declare function runNewsBridge(exchange?: string, batchSize?: number): Promise<NewsBridgeSummary>;
