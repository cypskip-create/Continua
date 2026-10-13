export declare function storeRawArtifact(params: {
    sourceId: string;
    sha256: string;
    contentType: string | null;
    body: Buffer;
}): Promise<string>;
/**
 * Reads a previously-stored artifact back off disk (§45 — reprocessing
 * must never require re-downloading a document that's already stored).
 * storagePath is the relative path as stored in raw_artifacts.storage_path.
 */
export declare function readRawArtifact(storagePath: string): Promise<Buffer>;
