export interface CrawlSummary {
    sourceId: string;
    visited: number;
    discovered: number;
    stored: number;
    failed: number;
}
export declare function crawlSource(sourceId: string, batchSize?: number): Promise<CrawlSummary>;
