import type { SourceDocument } from "../adapters/types.js";
export declare function enqueueDocuments(sourceId: string, documents: SourceDocument[]): Promise<void>;
/** Recover legacy jobs incorrectly completed after an empty PDF extraction.
 * Only the latest extraction is considered; valid history is never requeued. */
export declare function requeueIncompleteDocuments(sourceId: string, limit: number): Promise<void>;
export declare function claimDocuments(sourceId: string, limit: number): Promise<{
    id: number;
    document: SourceDocument;
    attempts: number;
}[]>;
export declare function finishDocument(id: number, attempts: number, error?: string): Promise<void>;
