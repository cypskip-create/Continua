import type { CompanyAnnouncement } from "../../types/market.js";
export declare const companyAnnouncementsRepository: {
    /**
     * Upsert keyed on scraped_extraction_id — this is what makes the
     * bridge idempotent (§44 of the scraper spec: running the same
     * ingestion twice must not create duplicates). Each scraper extraction
     * maps to at most one announcement row.
     */
    upsert(input: {
        companyId: string | null;
        securityId: string | null;
        rawCompanyName: string | null;
        title: string;
        documentUrl: string;
        source: string;
        exchange: string;
        scrapedArtifactId: number | null;
        scrapedExtractionId: number;
        extractionConfidence: number | null;
        needsReview: boolean;
        excerpt: string | null;
        publishedAt: string | null;
    }): Promise<void>;
    listBySecurity(securityId: string, limit?: number): Promise<CompanyAnnouncement[]>;
    /** Unresolved announcements — the operational queue for manually fixing entity resolution misses. */
    listUnresolved(limit?: number): Promise<CompanyAnnouncement[]>;
    existsForExtraction(scrapedExtractionId: number): Promise<boolean>;
};
