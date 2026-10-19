"""Preserve uncatalogued legacy files privately, without publishing invented metadata."""
import asyncio
import re
from .r2 import safe_key
from .legacy_cleanup import remove_exact, verify_pair
from .transfer_budget import TransferLimitReached

CANDIDATES = """WITH refs AS (
 SELECT replace(storage_path,chr(92),'/') AS key FROM scraping.raw_artifacts WHERE storage_path NOT LIKE 'r2://%%'
 UNION SELECT replace(metadata->>'r2LegacyStoragePath',chr(92),'/') FROM scraping.raw_artifacts WHERE metadata ? 'r2LegacyStoragePath'
 UNION SELECT substring(storage_path FROM length('r2://continua-financial-documents/')+1) FROM scraping.raw_artifacts WHERE storage_path LIKE 'r2://continua-financial-documents/%%'
) SELECT o.id::text AS original_id,o.name AS legacy_key,o.updated_at::text AS original_updated_at,
 (o.metadata->>'size')::bigint AS size_bytes,
 split_part(split_part(o.name,'/',3),'.',1) AS sha256,
 'r2://continua-financial-documents/'||o.name AS object_uri
 FROM storage.objects o LEFT JOIN refs ON refs.key=o.name
 LEFT JOIN scraping.uncatalogued_raw_archive c ON c.original_id=o.id::text
 WHERE o.bucket_id='scraper-raw' AND refs.key IS NULL
 AND o.name ~ '^[a-zA-Z0-9_-]{1,100}/[0-9]{4}/[a-f0-9]{64}[.][a-zA-Z0-9.]{1,20}$'
 AND (o.metadata->>'size')::bigint BETWEEN 1 AND 52428800
 AND (c.retry_at IS NULL OR c.retry_at<now())
 ORDER BY (o.metadata->>'size')::bigint DESC,o.name LIMIT %s"""


def preserve(row, storage):
    key = safe_key(row['legacy_key'])
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}/[0-9]{4}/[a-f0-9]{64}\.[a-zA-Z0-9.]{1,20}', key):
        raise ValueError('Uncatalogued key is not content-addressed')
    if storage.r2.bucket != 'continua-financial-documents' or not storage.rollback or storage.rollback.bucket != 'scraper-raw' or storage.r2.dual_write:
        raise ValueError('Uncatalogued archive requires exact private buckets and R2-only writes')
    if type(row['size_bytes']) is not int or not 1 <= row['size_bytes'] <= 50*1024**2:
        raise ValueError('Uncatalogued original exceeds limit')
    if key.rsplit('/', 1)[-1].split('.')[0] != row['sha256'] or storage.r2.key_from_location(row['object_uri']) != key:
        raise ValueError('Uncatalogued identity mismatch')
    with storage.rollback.materialize(key) as artifact:
        if artifact.sha256 != row['sha256'] or artifact.size != row['size_bytes']:
            raise ValueError('Uncatalogued source checksum mismatch')
        # upload is immutable and streams a full R2 readback/hash verification.
        storage.r2.upload(key, artifact)


class UncataloguedArchive:
    def __init__(self, database, storage):
        self.database, self.storage, self.task = database, storage, None

    async def run(self, limit=5):
        if type(limit) is not int or not 1 <= limit <= 20:
            raise ValueError('Uncatalogued batch must be 1–20')
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._run(limit))
        return await asyncio.shield(self.task)

    async def close(self):
        if self.task is not None:
            try:
                await asyncio.shield(self.task)
            except TransferLimitReached:
                pass

    async def _run(self, limit):
        result = dict(deleted=0, sourceBytesRemoved=0, failed=0, superseded=0, budgetPaused=False)
        for row in await self.database.query(CANDIDATES, (limit,)):
            try:
                async with self.database.pool.connection() as connection:
                    lock = 'continua-legacy-cleanup:' + row['legacy_key']
                    cursor = await connection.execute('SELECT pg_try_advisory_lock(hashtextextended(%s,0)) AS acquired', (lock,))
                    if not (await cursor.fetchone())['acquired']:
                        continue
                    try:
                        await asyncio.to_thread(preserve, row, self.storage)
                        # The same content identity validator is used for linked originals.
                        await asyncio.to_thread(verify_pair, dict(row, artifact_ids=['uncatalogued']), self.storage)
                        current = await self.database.query(CANDIDATES, (20,))
                        if row not in current:
                            result['superseded'] += 1
                            continue
                        await self.database.query("""INSERT INTO scraping.uncatalogued_raw_archive
                          (original_id,legacy_key,original_updated_at,object_uri,sha256,size_bytes,state,verified_at)
                          VALUES(%s,%s,%s,%s,%s,%s,'verified',now()) ON CONFLICT(original_id) DO UPDATE
                          SET legacy_key=excluded.legacy_key,original_updated_at=excluded.original_updated_at,
                          object_uri=excluded.object_uri,sha256=excluded.sha256,size_bytes=excluded.size_bytes,
                          state='verified',verified_at=now(),retry_at=NULL""",
                          tuple(row[k] for k in ('original_id','legacy_key','original_updated_at','object_uri','sha256','size_bytes')))
                        await asyncio.to_thread(remove_exact, row, self.storage)
                        if await self.database.query("SELECT id FROM storage.objects WHERE bucket_id='scraper-raw' AND name=%s", (row['legacy_key'],)):
                            raise ValueError('Uncatalogued original removal incomplete')
                        await self.database.query("UPDATE scraping.uncatalogued_raw_archive SET state='deleted',deleted_at=now() WHERE original_id=%s", (row['original_id'],))
                        result['deleted'] += 1
                        result['sourceBytesRemoved'] += row['size_bytes']
                    finally:
                        try:
                            await connection.execute('SELECT pg_advisory_unlock(hashtextextended(%s,0))', (lock,))
                        except BaseException:
                            await connection.close()
                            raise
            except TransferLimitReached:
                result['budgetPaused'] = True
                break
            except Exception:
                result['failed'] += 1
                # Do not log source bodies or private provider exceptions.
        return result
