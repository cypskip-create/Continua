/** Requeue source URLs only; never fabricate missing bytes or overwrite provenance. */
import { query, pool } from '../src/storage/db.js';
try {
    const limit = Number(process.argv[2] ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new Error('Recovery batch must be 1–500');
    const rows = (await query(`SELECT DISTINCT a.source_id,a.document_url FROM scraping.raw_artifacts a
    JOIN scraping.sources s ON s.id=a.source_id AND s.enabled=true
    WHERE a.content_type ILIKE '%pdf%' AND NOT EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id='scraper-raw' AND o.name=replace(a.storage_path,chr(92),'/'))
    ORDER BY a.source_id,a.document_url LIMIT $1`, [limit])).rows;
    if (process.argv.includes('--requeue')) {
        for (const row of rows)
            await query(`INSERT INTO scraping.crawl_state (source_id,url,canonical_url,depth,status)
      VALUES ($1,$2,$2,0,'discovered') ON CONFLICT (source_id,url) DO UPDATE
      SET status='discovered',last_seen=now(),error_reason=NULL
      WHERE scraping.crawl_state.status <> 'crawling'`, [row.source_id, row.document_url]);
    }
    console.log(JSON.stringify({ mode: process.argv.includes('--requeue') ? 'requeued' : 'dry_run', count: rows.length, sources: [...new Set(rows.map(r => r.source_id))] }));
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
finally {
    await pool.end();
}
