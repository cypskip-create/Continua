import { query } from "../db.js";
function mapRow(row) {
    return {
        ...row,
        exchange: row.exchange,
        extractionConfidence: row.extractionConfidence !== null ? Number(row.extractionConfidence) : null,
    };
}
export const companyAnnouncementsRepository = {
    /**
     * Upsert keyed on scraped_extraction_id — this is what makes the
     * bridge idempotent (§44 of the scraper spec: running the same
     * ingestion twice must not create duplicates). Each scraper extraction
     * maps to at most one announcement row.
     */
    async upsert(input) {
        await query(`INSERT INTO market.company_announcements
         (company_id, security_id, raw_company_name, title, document_url, source, exchange,
          scraped_artifact_id, scraped_extraction_id, extraction_confidence, needs_review, excerpt, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (scraped_extraction_id) DO UPDATE SET
         company_id = EXCLUDED.company_id,
         security_id = EXCLUDED.security_id,
         needs_review = EXCLUDED.needs_review,
         extraction_confidence = EXCLUDED.extraction_confidence,
         updated_at = now()`, [
            input.companyId,
            input.securityId,
            input.rawCompanyName,
            input.title,
            input.documentUrl,
            input.source,
            input.exchange,
            input.scrapedArtifactId,
            input.scrapedExtractionId,
            input.extractionConfidence,
            input.needsReview,
            input.excerpt,
            input.publishedAt,
        ]);
    },
    async listBySecurity(securityId, limit = 50) {
        const res = await query(`SELECT id::text, company_id as "companyId", security_id as "securityId", raw_company_name as "rawCompanyName",
              title, document_url as "documentUrl", source, exchange,
              scraped_artifact_id as "scrapedArtifactId", scraped_extraction_id as "scrapedExtractionId",
              extraction_confidence as "extractionConfidence", needs_review as "needsReview",
              excerpt, published_at as "publishedAt"
       FROM market.company_announcements
       WHERE security_id = $1
       ORDER BY created_at DESC LIMIT $2`, [securityId, limit]);
        return res.rows.map(mapRow);
    },
    /** Unresolved announcements — the operational queue for manually fixing entity resolution misses. */
    async listUnresolved(limit = 100) {
        const res = await query(`SELECT id::text, company_id as "companyId", security_id as "securityId", raw_company_name as "rawCompanyName",
              title, document_url as "documentUrl", source, exchange,
              scraped_artifact_id as "scrapedArtifactId", scraped_extraction_id as "scrapedExtractionId",
              extraction_confidence as "extractionConfidence", needs_review as "needsReview",
              excerpt, published_at as "publishedAt"
       FROM market.company_announcements
       WHERE company_id IS NULL
       ORDER BY created_at DESC LIMIT $1`, [limit]);
        return res.rows.map(mapRow);
    },
    async existsForExtraction(scrapedExtractionId) {
        const res = await query(`SELECT EXISTS(SELECT 1 FROM market.company_announcements WHERE scraped_extraction_id = $1) as exists`, [scrapedExtractionId]);
        return res.rows[0]?.exists ?? false;
    },
};
