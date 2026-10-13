export type DeadLetterStage = "fetch" | "parse" | "ocr" | "table_extract";
/**
 * Records a permanent failure — a URL that exhausted its retries (§21 of
 * the original spec: "record the exact reason"). Upserts on
 * (source_id, url, stage): the same URL failing repeatedly at the same
 * stage increments attempts and bumps last_failed rather than piling up
 * duplicate rows.
 */
export declare function recordDeadLetter(params: {
    sourceId: string;
    url: string;
    stage: DeadLetterStage;
    reason: string;
}): Promise<void>;
export declare function listDeadLetters(sourceId?: string, limit?: number): Promise<{
    id: number;
    sourceId: string;
    url: string;
    stage: string;
    reason: string;
    attempts: number;
    lastFailed: string;
}[]>;
