import { query } from "./db.js";

export async function archiveCheckpoint(sourceId: string, url: string, year: number) {
  const result = await query<{ pages: number[]; completed_pages: number[] }>(`
    INSERT INTO scraping.archive_checkpoints(source_id,archive_url,archive_year)
    VALUES($1,$2,$3) ON CONFLICT(source_id,archive_url,archive_year) DO UPDATE SET
      pages=CASE WHEN scraping.archive_checkpoints.refreshed_at < now()-interval '7 days' THEN '{1}'::integer[] ELSE scraping.archive_checkpoints.pages END,
      completed_pages=CASE WHEN scraping.archive_checkpoints.refreshed_at < now()-interval '7 days' THEN '{}'::integer[] ELSE scraping.archive_checkpoints.completed_pages END,
      refreshed_at=CASE WHEN scraping.archive_checkpoints.refreshed_at < now()-interval '7 days' THEN now() ELSE scraping.archive_checkpoints.refreshed_at END
    RETURNING pages,completed_pages`, [sourceId,url,year]);
  return result.rows[0]!;
}

/** Call only AFTER the page's documents have been durably enqueued. */
export async function completeArchivePage(sourceId: string, url: string, year: number, page: number, pages: number[]) {
  await query(`UPDATE scraping.archive_checkpoints SET
    pages=ARRAY(SELECT DISTINCT p FROM unnest(pages || $5::integer[]) p ORDER BY p),
    completed_pages=ARRAY(SELECT DISTINCT p FROM unnest(completed_pages || $4::integer) p ORDER BY p),
    updated_at=now() WHERE source_id=$1 AND archive_url=$2 AND archive_year=$3`, [sourceId,url,year,page,pages]);
}
