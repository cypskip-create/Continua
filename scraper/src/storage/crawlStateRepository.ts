import { query } from "./db.js";
import type { CrawlStateRow, CrawlStatus } from "../types.js";

interface CrawlStateSqlRow {
  id: number;
  source_id: string;
  url: string;
  canonical_url: string | null;
  parent_url: string | null;
  depth: number;
  status: CrawlStatus;
  mime_type: string | null;
  http_status: number | null;
  content_hash: string | null;
  first_seen: string;
  last_seen: string;
  last_crawled: string | null;
  last_changed: string | null;
  error_reason: string | null;
}

function mapRow(row: CrawlStateSqlRow): CrawlStateRow {
  return {
    id: row.id,
    sourceId: row.source_id,
    url: row.url,
    canonicalUrl: row.canonical_url,
    parentUrl: row.parent_url,
    depth: row.depth,
    status: row.status,
    mimeType: row.mime_type,
    httpStatus: row.http_status,
    contentHash: row.content_hash,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    lastCrawled: row.last_crawled,
    lastChanged: row.last_changed,
    errorReason: row.error_reason,
  };
}

/**
 * Register a discovered URL, or bump last_seen if already known. This is
 * the entry point that makes crawling incremental (§30) — a URL discovered
 * a hundred times across a hundred runs is still one row.
 */
export async function recordDiscovered(params: {
  sourceId: string;
  url: string;
  canonicalUrl?: string | null;
  parentUrl?: string | null;
  depth: number;
}): Promise<CrawlStateRow> {
  const res = await query<CrawlStateSqlRow>(
    `INSERT INTO scraping.crawl_state (source_id, url, canonical_url, parent_url, depth)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (source_id, url) DO UPDATE SET
       status = CASE WHEN scraping.crawl_state.status IN ('crawled', 'failed')
         AND COALESCE(scraping.crawl_state.last_crawled, scraping.crawl_state.last_seen) < now() - interval '1 day'
         THEN 'discovered' ELSE scraping.crawl_state.status END,
       last_seen = now()
     RETURNING *`,
    [params.sourceId, params.url, params.canonicalUrl ?? null, params.parentUrl ?? null, params.depth],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`recordDiscovered: insert returned no row for ${params.url}`);
  return mapRow(row);
}

/** Pull the next batch of URLs eligible to crawl for a source. */
export async function claimNextBatch(sourceId: string, limit: number): Promise<CrawlStateRow[]> {
  const res = await query<CrawlStateSqlRow>(
    `UPDATE scraping.crawl_state
       SET status = 'queued', last_seen = now()
     WHERE id IN (
       SELECT id FROM scraping.crawl_state
       WHERE source_id = $1 AND (status = 'discovered'
         OR (status IN ('queued', 'crawling') AND last_seen < now() - interval '1 hour'))
       ORDER BY depth ASC, first_seen ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [sourceId, limit],
  );
  return res.rows.map(mapRow);
}

export async function markCrawling(id: number): Promise<void> {
  await query(`UPDATE scraping.crawl_state SET status = 'crawling' WHERE id = $1`, [id]);
}

export async function markCrawled(params: {
  id: number;
  httpStatus: number;
  mimeType: string | null;
  contentHash: string;
  changed: boolean;
}): Promise<void> {
  await query(
    `UPDATE scraping.crawl_state
       SET status = 'crawled',
           http_status = $2,
           mime_type = $3,
           content_hash = $4,
           last_crawled = now(),
           last_changed = CASE WHEN $5 THEN now() ELSE last_changed END
     WHERE id = $1`,
    [params.id, params.httpStatus, params.mimeType, params.contentHash, params.changed],
  );
}

export async function markFailed(id: number, reason: string): Promise<void> {
  await query(`UPDATE scraping.crawl_state SET status = 'failed', error_reason = $2 WHERE id = $1`, [id, reason]);
}

export async function getByContentHash(sourceId: string, contentHash: string): Promise<CrawlStateRow | null> {
  const res = await query<CrawlStateSqlRow>(
    `SELECT * FROM scraping.crawl_state WHERE source_id = $1 AND content_hash = $2 LIMIT 1`,
    [sourceId, contentHash],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}
