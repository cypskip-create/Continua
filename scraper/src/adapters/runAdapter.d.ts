import type { SourceAdapter } from "./types.js";
export interface AdapterRunSummary {
    adapterId: string;
    discovered: number;
    fetched: number;
    newArtifacts: number;
    extracted: number;
    needsReview: number;
    failed: number;
}
export declare function runAdapter(adapter: SourceAdapter): Promise<AdapterRunSummary>;
