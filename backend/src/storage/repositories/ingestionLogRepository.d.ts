import type { IngestionRecord } from "../../types/market.js";
export declare const ingestionLogRepository: {
    log(record: Omit<IngestionRecord, "id">): Promise<void>;
    recent(limit?: number): Promise<IngestionRecord[]>;
};
