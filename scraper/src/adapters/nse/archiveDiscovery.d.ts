import type { SourceDocument } from "../types.js";
export declare function isOfficialNseUrl(raw: string): boolean;
export declare function canonicalArchiveUrl(raw: string): string;
/** Follow the publisher's category/View All links, not an unrestricted site crawl. */
export declare function archiveCategoryLinks(html: string, pageUrl: string): string[];
/** Reads the live publisher configuration; never guesses category IDs or nonce values.
 * Verified against NSE nse-downloads/assets/js/nse_list.js on 2026-10-10. */
export declare function archiveFormConfig(html: string, fromYear?: number): {
    endpoint: string;
    security: string;
    category: string;
    limit: string;
    expiry: string;
    years: string[];
} | null;
export declare function archivePageNumbers(html: string): number[];
export declare function archiveDocuments(html: string, pageUrl: string, context?: Record<string, unknown>): SourceDocument[];
