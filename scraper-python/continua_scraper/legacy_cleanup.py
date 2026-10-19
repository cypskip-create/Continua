"""Remove only content-addressed legacy originals with reverified private R2 copies.

No bucket sweep, database-object deletion, new source requests or credential
destination is accepted. This is separate from ordinary Render collection.
"""
import asyncio
import json
import re
from datetime import datetime,timezone,timedelta
from .r2 import safe_key
from .transfer_budget import TransferLimitReached

CANDIDATES = """WITH copies AS (
 SELECT replace(COALESCE(metadata->>'r2LegacyStoragePath',substring(storage_path FROM length('r2://continua-financial-documents/')+1)),chr(92),'/') AS legacy_key,
 min(sha256) AS sha256,min(size_bytes) AS size_bytes,min(storage_path) AS object_uri,
 array_agg(id ORDER BY id) AS artifact_ids
 FROM scraping.raw_artifacts WHERE metadata ? 'r2LegacyStoragePath' OR storage_path LIKE 'r2://continua-financial-documents/%%'
 GROUP BY replace(COALESCE(metadata->>'r2LegacyStoragePath',substring(storage_path FROM length('r2://continua-financial-documents/')+1)),chr(92),'/')
 HAVING bool_and(storage_path LIKE 'r2://continua-financial-documents/%%')
 AND bool_and(COALESCE(NULLIF(metadata->>'r2LegacyCleanupRetryAt','')::timestamptz,'epoch'::timestamptz)<now())
 AND count(DISTINCT sha256)=1 AND count(DISTINCT size_bytes)=1 AND count(DISTINCT storage_path)=1
) SELECT c.*,o.id::text AS original_id,o.updated_at::text AS original_updated_at
 FROM copies c JOIN storage.objects o ON o.bucket_id='scraper-raw' AND o.name=c.legacy_key
 WHERE c.size_bytes BETWEEN 1 AND 52428800
 AND NOT EXISTS(SELECT 1 FROM scraping.raw_artifacts a
   WHERE replace(a.storage_path,chr(92),'/')=c.legacy_key)
 ORDER BY c.size_bytes DESC,c.legacy_key LIMIT %s"""


def validate_candidate(row,storage):
    key=safe_key(row['legacy_key'])
    digest=row['sha256']
    if not re.fullmatch('[a-f0-9]{64}',digest) or key.rsplit('/',1)[-1].split('.')[0]!=digest:
        raise ValueError('Legacy original is not content-addressed')
    if storage.r2.bucket!='continua-financial-documents' or not storage.rollback or storage.rollback.bucket!='scraper-raw':
        raise ValueError('Cleanup requires the exact owned private buckets')
    storage.r2.key_from_location(row['object_uri'])
    if type(row['size_bytes']) is not int or not 1<=row['size_bytes']<=50*1024**2:
        raise ValueError('Cleanup object exceeds bounded batch size')
    if not row['artifact_ids'] or not row['original_id'] or not row['original_updated_at']:
        raise ValueError('Cleanup identity is incomplete')


def verify_pair(row,storage):
    validate_candidate(row,storage)
    # Both readers stream through the existing shared transfer budget. RawStorage
    # also verifies decoded bytes if the private R2 representation is compressed.
    for reader,key in ((storage.materialize,row['object_uri']),(storage.rollback.materialize,row['legacy_key'])):
        with reader(key) as artifact:
            if artifact.sha256!=row['sha256'] or artifact.size!=row['size_bytes']:
                raise ValueError('Cleanup copy or original checksum mismatch')


def remove_exact(row,storage):
    reader=storage.rollback
    response=reader.client.request('DELETE',reader.origin+'/storage/v1/object/scraper-raw',
        body=json.dumps({'prefixes':[row['legacy_key']]}).encode(),
        headers=dict(reader._headers(),**{'Content-Type':'application/json'}),
        redirect=False,retries=False,preload_content=False,pool_timeout=10)
    try:
        if response.status!=200:raise ValueError('Verified original removal failed')
        if len(response.read(1048577))>1048576:raise ValueError('Cleanup acknowledgement exceeds limit')
    finally:response.close();response.release_conn()


class VerifiedLegacyCleanup:
    def __init__(self,database,storage):self.database,self.storage=database,storage;self.task=None

    async def run(self,limit=5):
        if type(limit) is not int or not 1<=limit<=20:raise ValueError('Cleanup batch must be 1–20')
        if self.task is None or self.task.done():self.task=asyncio.create_task(self._run(limit))
        return await asyncio.shield(self.task)

    async def close(self):
        if self.task is not None:
            try:await asyncio.shield(self.task)
            except TransferLimitReached:pass

    async def _run(self,limit):
        result={'deleted':0,'sourceBytesRemoved':0,'failed':0,'superseded':0,'budgetPaused':False}
        for row in await self.database.query(CANDIDATES,(limit,)):
            try:
                validate_candidate(row,self.storage)
                # One session lock covers verification, final database recheck,
                # exact API removal and receipt. Other cleanup workers skip it.
                async with self.database.pool.connection() as connection:
                    cursor=await connection.execute("SELECT pg_try_advisory_lock(hashtextextended(%s,0)) AS acquired",('continua-legacy-cleanup:'+row['legacy_key'],))
                    if not (await cursor.fetchone())['acquired']:continue
                    try:
                        await asyncio.to_thread(verify_pair,row,self.storage)
                        candidates=await self.database.query(CANDIDATES,(20,))
                        current=next((r for r in candidates if r['legacy_key']==row['legacy_key']),None)
                        if current!=row:result['superseded']+=1;continue
                        receipt={'state':'verified-before-removal','sha256':row['sha256'],'sizeBytes':row['size_bytes'],
                                 'objectUri':row['object_uri'],'originalId':row['original_id'],
                                 'originalUpdatedAt':row['original_updated_at'],'verifiedAt':datetime.now(timezone.utc).isoformat()}
                        updated=await self.database.query("UPDATE scraping.raw_artifacts SET metadata=metadata||%s::jsonb WHERE id=ANY(%s) AND storage_path=%s AND sha256=%s RETURNING id",
                            (json.dumps({'r2LegacyCleanup':receipt}),row['artifact_ids'],row['object_uri'],row['sha256']))
                        if sorted(r['id'] for r in updated)!=sorted(row['artifact_ids']):result['superseded']+=1;continue
                        await asyncio.to_thread(remove_exact,row,self.storage)
                        remaining=await self.database.query("SELECT id FROM storage.objects WHERE bucket_id='scraper-raw' AND name=%s",(row['legacy_key'],))
                        if remaining:raise ValueError('Original removal remains incomplete')
                        receipt['state']='deleted';receipt['deletedAt']=datetime.now(timezone.utc).isoformat()
                        await self.database.query("UPDATE scraping.raw_artifacts SET metadata=metadata||%s::jsonb WHERE id=ANY(%s) AND storage_path=%s AND sha256=%s",
                            (json.dumps({'r2LegacyCleanup':receipt}),row['artifact_ids'],row['object_uri'],row['sha256']))
                        result['deleted']+=1;result['sourceBytesRemoved']+=row['size_bytes']
                    finally:
                        try:await connection.execute("SELECT pg_advisory_unlock(hashtextextended(%s,0))",('continua-legacy-cleanup:'+row['legacy_key'],))
                        except BaseException:
                            await connection.close()
                            raise
            except TransferLimitReached:
                result['budgetPaused']=True
                break
            except Exception:
                result['failed']+=1
                retry_at=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
                await self.database.query("UPDATE scraping.raw_artifacts SET metadata=metadata||%s::jsonb WHERE id=ANY(%s)",
                    (json.dumps({'r2LegacyCleanupRetryAt':retry_at,'r2LegacyCleanupError':'verification-or-removal-failed'}),row['artifact_ids']))
        return result
