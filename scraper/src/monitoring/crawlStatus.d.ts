export interface CrawlStatusReport {
    sources: {
        id: string;
        name: string;
        enabled: boolean;
    }[];
    crawlStateBySourceAndStatus: {
        sourceId: string;
        status: string;
        count: number;
    }[];
    totalRawArtifacts: number;
    extractionsByMethod: {
        method: string;
        count: number;
    }[];
    needsReviewCount: number;
    deadLetterCount: number;
}
export declare function getCrawlStatus(): Promise<CrawlStatusReport>;
