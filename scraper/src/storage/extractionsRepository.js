import { query } from "./db.js";
import { env } from "../config/index.js";
function mapRow(row) {
    return {
        id: row.id,
        artifactId: row.artifact_id,
        method: row.method,
        confidence: row.confidence,
        parserVersion: row.parser_version,
        text: row.text,
        tables: row.tables,
        entity: row.entity,
        needsReview: row.needs_review,
        extractedAt: row.extracted_at,
    };
}
/**
 * Always inserts a new row rather than updating in place — reprocessing
 * an artifact with a newer parser version (§45) should leave the old
 * extraction visible for comparison, not silently overwrite it.
 */
export async function insertExtraction(input) {
    const res = await query(`INSERT INTO scraping.extractions
       (artifact_id, method, confidence, parser_version, text, tables, entity, needs_review)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`, [
        input.artifactId,
        input.method,
        input.confidence,
        input.parserVersion,
        input.text,
        JSON.stringify(input.tables ?? []),
        JSON.stringify(input.entity ?? {}),
        input.needsReview,
    ]);
    const row = res.rows[0];
    if (!row)
        throw new Error(`insertExtraction: insert returned no row for artifact ${input.artifactId}`);
    return mapRow(row);
}
/**
 * Artifacts with no usable extraction yet (including legacy empty PDFs) — distinct from
 * listNeedsReview() below, which is about extractions that ran but came
 * back low-confidence. This is for artifacts that never got a chance to
 * run successfully: today that's every raw_artifact stored via the generic crawler
 * (crawler/crawlSource.ts stores bytes for provenance but doesn't invoke
 * extraction itself — only the adapter-based runAdapter.ts path does).
 * extractionSweep.ts uses this to catch generic-crawled PDFs/HTML up
 * with the same extraction adapter-based sources already get for free.
 */
export async function findUnextracted(limit = 50) {
    const res = await query(`SELECT a.id as artifact_id, a.source_id, a.adapter, a.content_type, a.storage_path, a.document_url
     FROM scraping.raw_artifacts a
     LEFT JOIN LATERAL (SELECT e.id,e.text FROM scraping.extractions e WHERE e.artifact_id=a.id
       ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1) e ON true
     WHERE (e.id IS NULL OR (a.content_type ILIKE '%pdf%' AND length(trim(coalesce(e.text,'')))<50))
       AND (a.content_type ILIKE '%pdf%' OR a.content_type ILIKE '%html%')
       AND ($2::boolean = false OR EXISTS (
         SELECT 1 FROM storage.objects o WHERE o.bucket_id=$3
           AND o.name=replace(a.storage_path,chr(92),'/')
       ))
       AND NOT EXISTS (SELECT 1 FROM scraping.dead_letters d
         WHERE d.source_id=a.source_id AND d.url=a.document_url AND d.stage='parse'
           AND d.last_failed > now()-interval '1 hour')
     ORDER BY (a.content_type ILIKE '%pdf%') DESC, a.discovered_at ASC
     LIMIT $1`, [limit, env.RAW_STORAGE_DRIVER === 'supabase', env.SUPABASE_STORAGE_BUCKET]);
    return res.rows.map((row) => ({
        artifactId: row.artifact_id,
        sourceId: row.source_id,
        adapter: row.adapter,
        contentType: row.content_type,
        storagePath: row.storage_path,
        documentUrl: row.document_url,
    }));
}
export async function findLatestExtraction(artifactId) {
    const res = await query(`SELECT * FROM scraping.extractions WHERE artifact_id = $1 ORDER BY extracted_at DESC LIMIT 1`, [artifactId]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
}
/**
 * Review queue (§39): the latest extraction per artifact where THAT
 * latest extraction still needs review — an artifact that was
 * successfully reprocessed after an earlier low-confidence attempt
 * should drop off this list, not linger because of its stale history.
 */
export async function listNeedsReview(limit = 100) {
    const res = await query(`SELECT * FROM (
       SELECT DISTINCT ON (e.artifact_id) e.*, a.title, a.document_url, a.source_id
       FROM scraping.extractions e
       JOIN scraping.raw_artifacts a ON a.id = e.artifact_id
       ORDER BY e.artifact_id, e.extracted_at DESC
     ) latest
     WHERE needs_review = true
     ORDER BY extracted_at DESC
     LIMIT $1`, [limit]);
    return res.rows.map((row) => ({
        ...mapRow(row),
        title: row.title,
        documentUrl: row.document_url,
        sourceId: row.source_id,
    }));
}
