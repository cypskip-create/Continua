import type { CrawlStateRow } from "../types.js";
/**
 * Register a discovered URL, or bump last_seen if already known. This is
 * the entry point that makes crawling incremental (§30) — a URL discovered
 * a hundred times across a hundred runs is still one row.
 */
export declare function recordDiscovered(params: {
    sourceId: string;
    url: string;
    canonicalUrl?: string | null;
    parentUrl?: string | null;
    depth: number;
    revisitAfterMinutes?: number;
}): Promise<CrawlStateRow>;
/** Pull the next batch of URLs eligible to crawl for a source. */
export declare function claimNextBatch(sourceId: string, limit: number): Promise<CrawlStateRow[]>;
export declare function markCrawling(id: number): Promise<void>;
export declare function markCrawled(params: {
    id: number;
    httpStatus: number;
    mimeType: string | null;
    contentHash: string;
    changed: boolean;
}): Promise<void>;
export declare function markFailed(id: number, reason: string): Promise<void>;
export declare function getByContentHash(sourceId: string, contentHash: string): Promise<CrawlStateRow | null>;
