import { query } from "./db.js";
import type { SourceDocument } from "../adapters/types.js";

export async function enqueueDocuments(sourceId: string, documents: SourceDocument[]) {
  for (let offset = 0; offset < documents.length; offset += 200) {
    await query(`INSERT INTO scraping.document_jobs(source_id,url,document)
      SELECT $1, item->>'url', item FROM jsonb_array_elements($2::jsonb) item
      ON CONFLICT(source_id,url) DO UPDATE SET document=EXCLUDED.document,
        status=CASE WHEN document_jobs.status='complete' AND document_jobs.updated_at < now()-interval '7 days' THEN 'pending' ELSE document_jobs.status END`,
    [sourceId, JSON.stringify(documents.slice(offset, offset + 200))]);
  }
}

/** Recover legacy jobs incorrectly completed after an empty PDF extraction.
 * Only the latest extraction is considered; valid history is never requeued. */
export async function requeueIncompleteDocuments(sourceId: string, limit: number): Promise<void> {
  await query(`WITH incomplete AS (
    SELECT j.id FROM scraping.document_jobs j WHERE j.source_id=$1 AND j.status='complete'
      AND EXISTS(SELECT 1 FROM LATERAL (
          SELECT a.id FROM scraping.raw_artifacts a WHERE a.source_id=j.source_id AND a.document_url=j.url
          ORDER BY a.retrieved_at DESC,a.id DESC LIMIT 1
        ) artifact
        JOIN LATERAL (SELECT e.method,e.text FROM scraping.extractions e WHERE e.artifact_id=artifact.id
          ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1) latest ON true
        WHERE latest.method IN ('native_pdf_text','ocr') AND length(trim(coalesce(latest.text,'')))<50)
    ORDER BY j.id FOR UPDATE SKIP LOCKED LIMIT $2
  ) UPDATE scraping.document_jobs j SET status='pending',next_attempt_at=now(),updated_at=now(),
      error_reason='Recovering incomplete legacy PDF extraction'
    FROM incomplete WHERE j.id=incomplete.id`, [sourceId,limit]);
}
export async function claimDocuments(sourceId: string, limit: number): Promise<{ id: number; document: SourceDocument; attempts: number }[]> {
  const result = await query(`WITH pending AS (
    SELECT id FROM scraping.document_jobs WHERE source_id=$1 AND
      ((status IN ('pending','failed') AND next_attempt_at <= now()) OR (status='processing' AND lease_until < now()))
    ORDER BY attempts,
      CASE WHEN source_id='kenyanstocks' THEN
        CASE WHEN url ~* '\\.pdf($|[?])' THEN 0
             WHEN document->'context'->>'tab'='Files' THEN 1
             WHEN document->'context'->>'tab'='Financials' THEN 2 ELSE 3 END
        ELSE 0 END,
      created_at, id FOR UPDATE SKIP LOCKED LIMIT $2
  ) UPDATE scraping.document_jobs j SET status='processing',attempts=j.attempts+1,
    lease_until=now()+interval '2 hours', updated_at=now()
    FROM pending WHERE j.id=pending.id RETURNING j.id,j.document,j.attempts`, [sourceId, limit]);
  return result.rows;
}
export async function finishDocument(id: number, attempts: number, error?: string) {
  // Attempt token prevents an expired worker from overwriting a newer lease.
  await query(`UPDATE scraping.document_jobs SET status=$3, error_reason=$4, lease_until=NULL,
    next_attempt_at=now()+interval '1 hour', updated_at=now() WHERE id=$1 AND attempts=$2`,
  [id, attempts, error ? "failed" : "complete", error?.slice(0, 1000) ?? null]);
}
