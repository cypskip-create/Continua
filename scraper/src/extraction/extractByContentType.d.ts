import type { ExtractionMethod } from "../types.js";
export interface ContentExtractionResult {
    parserVersion?: string;
    method: ExtractionMethod;
    confidence: number | null;
    text: string | null;
    tables: unknown[];
    needsReview: boolean;
}
export declare function extractByContentType(contentType: string | null, body: Buffer): Promise<ContentExtractionResult | null>;
