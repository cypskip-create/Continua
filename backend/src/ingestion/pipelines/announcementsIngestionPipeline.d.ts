export interface AnnouncementsBridgeSummary {
    processed: number;
    resolved: number;
    unresolved: number;
    failed: number;
}
export declare function runAnnouncementsBridge(exchange?: string, batchSize?: number): Promise<AnnouncementsBridgeSummary>;
