import type { NewRawArtifact, RawArtifact } from "../types.js";
export declare function findBySha256(sourceId: string, sha256: string): Promise<RawArtifact | null>;
export declare function findById(id: number): Promise<RawArtifact | null>;
/**
 * Insert a new raw artifact, or return the existing one if this content
 * hash was already stored for this source (§17 — same PDF, no duplicate
 * processing). Callers should check the return's `isNew` flag before
 * kicking off extraction — reprocessing an unchanged artifact is wasted
 * work.
 */
export declare function upsertArtifact(input: NewRawArtifact): Promise<{
    artifact: RawArtifact;
    isNew: boolean;
}>;
