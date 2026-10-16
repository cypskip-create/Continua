import { query } from '../../storage/db.js';

/** Read already processed observations, never fetch/decode private R2 files.
 * Recheck rights on every read. Unknown/OCR documents stay review-labelled and
 * must not be fed to valuation or overwrite canonical statement periods.
 */
export async function collectedResearch(symbol, limit = 20, offset = 0) {
    if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) return [];
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
        throw new Error('Invalid collected research page');
    const result = await query(`SELECT payload FROM (
      SELECT DISTINCT ON (p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END)
        p.payload,e.extracted_at,e.id
      FROM scraping.processed_research p JOIN scraping.extractions e ON e.id=p.extraction_id
      JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
      WHERE p.security_id=$1 AND p.processor_version='collected-research-v1'
        AND p.status IN ('publisher_observation','review_required','empty')
        AND p.destination<>'review' AND s.enabled AND s.redistribution_allowed=true
        AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND a.storage_path LIKE 'r2://continua-financial-documents/%'
        AND a.sha256 ~ '^[a-f0-9]{64}$'
      ORDER BY p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END,e.extracted_at DESC,e.id DESC
    ) latest ORDER BY extracted_at DESC,id DESC LIMIT $2 OFFSET $3`, [`NSE:${symbol}`, limit, offset]);
    if (Buffer.byteLength(JSON.stringify(result.rows)) > 8 * 1024 * 1024)
        throw new Error('Collected research response too large; request a smaller page');
    return result.rows.map(r => r.payload);
}
