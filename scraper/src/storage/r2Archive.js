/** Bounded, restart-safe private archive migration. Originals are never deleted.
 * Node handles storage I/O; PostgreSQL records only verified object references.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { query } from './db.js';
import { env } from '../config/index.js';
import { readRawArtifact } from './rawStorage.js';
import { safeObjectKey, writeR2 } from './r2Storage.js';
import { logger } from '../monitoring/logger.js';
let active;
export function archiveToR2(limit = 5) {
    if (active) return active;
    if (env.RAW_STORAGE_DRIVER !== 'r2') return Promise.resolve({copied:0, failed:0, disabled:true});
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return Promise.reject(new Error('Archive batch must be 1–20'));
    active = runArchive(limit).finally(() => {active = undefined;});
    return active;
}
async function runArchive(limit) {
    const pending = await query(`SELECT a.*, e.id AS extraction_id
      FROM scraping.raw_artifacts a
      LEFT JOIN LATERAL (SELECT * FROM scraping.extractions WHERE artifact_id=a.id
        AND id > COALESCE(NULLIF(a.metadata->>'r2ExtractionId','')::bigint,0)
        ORDER BY id ASC LIMIT 1) e ON true
      WHERE (a.storage_path NOT LIKE 'r2://%' OR e.id IS NOT NULL)
      AND COALESCE(NULLIF(a.metadata->>'r2ArchiveRetryAt','')::timestamptz,'epoch'::timestamptz) < now()
      ORDER BY (a.content_type LIKE '%pdf%') DESC, a.id LIMIT $1`, [limit]);
    const summary = {copied:0, failed:0};
    for (const artifact of pending.rows) {
        try {
            const oldPath = artifact.storage_path;
            let key;
            if (oldPath.startsWith('r2://')) {
                const location = new URL(oldPath);
                if (location.hostname !== env.R2_BUCKET) throw new Error('Unexpected archive bucket');
                key = safeObjectKey(location.pathname.slice(1));
            } else {
                key = safeObjectKey(oldPath.replaceAll('\\','/'));
                const bytes = await readRawArtifact(oldPath);
                if (bytes.length !== Number(artifact.size_bytes)) throw new Error('Archive source size mismatch');
                await writeR2(key, bytes, artifact.sha256, artifact.content_type);
            }
            const metadata = {r2ArchivedAt:new Date().toISOString(), r2ArchiveRetryAt:''};
            if (artifact.extraction_id) {
                // Fetch one snapshot at a time, not five potentially large texts.
                const extracted = await query('SELECT * FROM scraping.extractions WHERE id=$1 AND artifact_id=$2', [artifact.extraction_id,artifact.id]);
                const snapshot = extracted.rows[0];
                if (!snapshot) throw new Error('Extraction snapshot disappeared');
                const plain = Buffer.from(JSON.stringify({schemaVersion:1, artifactId:artifact.id,
                    sourceId:artifact.source_id, documentUrl:artifact.document_url,
                    rawObject:`r2://${env.R2_BUCKET}/${key}`, extraction:snapshot}));
                if(plain.length>env.MAX_RESPONSE_SIZE_BYTES)throw new Error('Snapshot exceeds response limit');
                const bytes=gzipSync(plain,{level:6});
                const hash = createHash('sha256').update(bytes).digest('hex');
                const snapshotKey = `extractions/${artifact.source_id}/${artifact.id}/${hash}.json.gz`;
                await writeR2(snapshotKey, bytes, hash, 'application/gzip');
                metadata.r2ExtractionId = String(artifact.extraction_id);
                metadata.r2ExtractionObject = `r2://${env.R2_BUCKET}/${snapshotKey}`;
                metadata.r2ExtractionFormat = 'gzip-json-v1';
            }
            // Compare-and-set keeps a concurrently refreshed raw reference intact.
            await query(`UPDATE scraping.raw_artifacts SET storage_path=$2,
              metadata=COALESCE(metadata,'{}'::jsonb)||$3::jsonb WHERE id=$1 AND storage_path=$4`,
                [artifact.id, `r2://${env.R2_BUCKET}/${key}`, JSON.stringify(metadata), oldPath]);
            summary.copied++;
        } catch (error) {
            summary.failed++;
            // Do not let one missing legacy file starve every other document.
            await query(`UPDATE scraping.raw_artifacts SET metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb WHERE id=$1`,
                [artifact.id, JSON.stringify({r2ArchiveRetryAt:new Date(Date.now()+3600000).toISOString()})]);
            logger.warn({artifactId:artifact.id, reason:String(error.message??error)}, 'R2 archive copy will retry; original retained');
        }
    }
    logger.info(summary, 'Private R2 archive batch complete');
    return summary;
}
