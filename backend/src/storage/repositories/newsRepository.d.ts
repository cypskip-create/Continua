import type { NewsItem } from "../../types/market.js";
export declare const newsRepository: {
    /** Repair historical associations without changing article text or dates. */
    revalidateBatch(afterId?: string, limit?: number): Promise<{
        lastId: string;
        processed: number;
        corrected: number;
    }>;
    /**
     * Upsert keyed on scraped_extraction_id — same idempotency pattern as
     * companyAnnouncementsRepository. Security mentions are replaced
     * wholesale on re-run (delete + re-insert) rather than diffed, since a
     * re-run only happens when the bridge reprocesses an extraction (e.g.
     * after a securities-directory change), and the set is small.
     */
    upsert(input: {
        headline: string;
        excerpt: string | null;
        articleUrl: string;
        source: string;
        sourceName: string;
        category: NewsItem["category"];
        imageUrl: string | null;
        securityIds: string[];
        scrapedArtifactId: number | null;
        scrapedExtractionId: number;
        extractionConfidence: number | null;
        needsReview: boolean;
        publishedAt: string | null;
    }): Promise<void>;
    listRecent(limit?: number, category?: NewsItem["category"]): Promise<NewsItem[]>;
    listBySecurity(securityId: string, limit?: number): Promise<NewsItem[]>;
    getById(id: string): Promise<NewsItem | null>;
    existsForExtraction(scrapedExtractionId: number): Promise<boolean>;
};
