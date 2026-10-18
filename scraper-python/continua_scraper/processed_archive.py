"""Immutable private processed objects, separately namespaced from originals.

Retain the SQL read projection until reader cutover is independently verified.
An export receipt never means the original payload can safely be deleted.
"""
import asyncio
import gzip
import hashlib
import json
import pathlib
import re
import tempfile
from .archive import snapshot_encoder
from .download import Artifact
from .r2 import R2Storage


PROJECTION_FIELDS=('version','presentationVersion','status','destination','category','tab',
    'observedAt','sourceUrl','financialFields','companyResearch','history')


def read_projection(payload):
    """Retain queryable numeric facts, never bulk tables/charts/narratives.

    Full presentation payloads live in verified immutable R2 objects. The SQL
    numerical read model can be rebuilt from those objects without raw parsing.
    """
    result={key:payload[key] for key in PROJECTION_FIELDS if key in payload}
    result.update(cloudPayload=True,cloudPayloadVersion=1,
        tableCount=len(payload.get('tables') or []),chartCount=len(payload.get('charts') or []),
        ownershipCount=len(payload.get('ownership') or []))
    return result


class ProcessedArchive:
    def __init__(self,database,storage,*,retire_payloads=False):
        if type(retire_payloads) is not bool:raise ValueError('Invalid processed retirement mode')
        self.database=database
        self.retire_payloads=retire_payloads
        self.storage=R2Storage(storage.client,storage.bucket,dual_write=False,
            max_bytes=storage.max_bytes,transfers=storage.transfers,upload_attempts=storage.upload_attempts)

    async def verified_copy(self,row):
        # Cancelling an asyncio wrapper cannot stop synchronous SDK I/O. Drain
        # this owned operation before releasing its budget/client or beginning
        # another copy, so a slow provider cannot accumulate abandoned threads.
        task=asyncio.create_task(asyncio.to_thread(self.copy,row))
        try:return await asyncio.shield(task)
        except asyncio.CancelledError:
            await asyncio.gather(task,return_exceptions=True)
            raise

    def copy(self,row):
        version=row['processor_version']
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',version):
            raise ValueError('Invalid processed object version')
        payload=row['payload']
        if payload.get('cloudPayload') is True:
            # Context recalculation may update a compact projection after its
            # full payload was retired. Restore the immutable prior object,
            # verify its exact identity, then merge only numerical projection
            # fields. A projection must never replace a full object silently.
            location=row.get('previous_object_uri') or ''
            prefix=f"processed/research/{version}/{row['extraction_id']}/"
            key=self.storage.key_from_location(location)
            if not key.startswith(prefix) or not re.fullmatch(r'[a-f0-9]{64}\.json\.gz',key[len(prefix):]):raise ValueError('Invalid prior processed object')
            with self.storage.materialize(key) as artifact:
                with gzip.open(artifact.path,'rb') as body:decoded=body.read(self.storage.max_bytes+1)
            if len(decoded)>self.storage.max_bytes:raise ValueError('Prior processed object exceeds limit')
            previous=json.loads(decoded,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Invalid processed number')))
            if previous.get('schemaVersion')!=1 or previous.get('kind')!='processed-research' or previous.get('extractionId')!=row['extraction_id'] or previous.get('processorVersion')!=version or previous.get('securityId')!=row['security_id'] or previous.get('destination')!=row['destination'] or previous.get('status')!=row['status'] or not isinstance(previous.get('payload'),dict):
                raise ValueError('Prior processed object identity mismatch')
            payload=dict(previous['payload'],**{key:payload[key] for key in PROJECTION_FIELDS if key in payload})
        if sum(len(part.encode('utf-8')) for part in snapshot_encoder().iterencode(payload))>8*1024*1024:
            raise ValueError('Processed presentation exceeds API budget')
        value={'schemaVersion':1,'kind':'processed-research','extractionId':row['extraction_id'],
               'processorVersion':version,'securityId':row['security_id'],
               'destination':row['destination'],'status':row['status'],'payload':payload}
        decoded=0
        with tempfile.TemporaryDirectory(prefix='continua-processed-') as directory:
            path=pathlib.Path(directory)/'research.json.gz'
            with path.open('xb') as body,gzip.GzipFile(fileobj=body,mode='wb',filename='',mtime=0,compresslevel=6) as compressed:
                for part in snapshot_encoder().iterencode(value):
                    chunk=part.encode('utf-8');decoded+=len(chunk)
                    if decoded>self.storage.max_bytes:raise ValueError('Processed snapshot exceeds limit')
                    compressed.write(chunk)
            size=path.stat().st_size
            if not 1<=size<=min(self.storage.max_bytes,8*1024*1024):raise ValueError('Processed snapshot exceeds limit')
            with path.open('rb') as body:digest=hashlib.file_digest(body,'sha256').hexdigest()
            key=f"processed/research/{version}/{row['extraction_id']}/{digest}.json.gz"
            location=self.storage.upload(key,Artifact(path,'https://fixture.invalid/never-fetched','application/gzip',size,digest))
        return location,digest,size,payload

    async def update_context(self,extraction_id,version,context):
        """Publish a projected issuer's new context and object pointer atomically.

        A failed upload leaves the prior complete presentation readable. Neither
        a projection nor a missing pointer can leak during context recalculation.
        """
        async with self.database.transaction() as tx:
            rows=await tx.query("""SELECT p.*,c.object_uri AS previous_object_uri
              FROM scraping.processed_research p
              JOIN scraping.processed_cloud_archive c USING(extraction_id,processor_version)
              WHERE p.extraction_id=%s AND p.processor_version=%s
              FOR UPDATE OF p""",(extraction_id,version))
            if not rows:return False
            row=rows[0]
            if row['payload'].get('cloudPayload') is not True:return False
            if row['payload'].get('companyResearch')==context:return True
            changed=dict(row,payload=dict(row['payload'],companyResearch=context))
            location,digest,size,payload=await self.verified_copy(changed)
            updated=await tx.query("""UPDATE scraping.processed_research SET payload=%s::jsonb,processed_at=now()
              WHERE extraction_id=%s AND processor_version=%s AND processed_at=%s RETURNING processed_at""",
              (json.dumps(read_projection(payload),ensure_ascii=False,allow_nan=False,separators=(',',':')),
               extraction_id,version,row['processed_at']))
            if not updated:return False
            await tx.query("""UPDATE scraping.processed_cloud_archive SET processed_at=%s,
              object_uri=%s,sha256=%s,size_bytes=%s,verified_at=now()
              WHERE extraction_id=%s AND processor_version=%s""",
              (updated[0]['processed_at'],location,digest,size,extraction_id,version))
            return True

    async def run(self,limit=25):
        if type(limit) is not int or not 1<=limit<=100:raise ValueError('Invalid processed archive batch')
        summary={'copied':0,'failed':0,'superseded':0}
        # One body per transaction; locks prevent duplicate work across workers.
        # The timestamp condition notices company-context or processor updates.
        for _ in range(limit):
            async with self.database.transaction() as tx:
                rows=await tx.query("""SELECT p.*,c.object_uri AS previous_object_uri FROM scraping.processed_research p
                  LEFT JOIN scraping.processed_cloud_archive c USING(extraction_id,processor_version)
                  WHERE c.processed_at IS DISTINCT FROM p.processed_at
                    OR (%s AND p.payload->>'cloudPayload' IS DISTINCT FROM 'true')
                  ORDER BY (p.status='publisher_observation') DESC,p.processed_at,p.extraction_id
                  FOR UPDATE OF p SKIP LOCKED LIMIT 1""",(self.retire_payloads,))
                if not rows:break
                row=rows[0]
                try:location,digest,size,payload=await self.verified_copy(row)
                except Exception as error:
                    from .transfer_budget import TransferLimitReached
                    if isinstance(error,TransferLimitReached):raise
                    # Stop this bounded sweep instead of spinning on one failed
                    # object or claiming that an unverified upload was archived.
                    summary['failed']+=1
                    break
                receipt=await tx.query("""INSERT INTO scraping.processed_cloud_archive
                    (extraction_id,processor_version,processed_at,object_uri,sha256,size_bytes)
                  SELECT extraction_id,processor_version,processed_at,%s,%s,%s
                  FROM scraping.processed_research WHERE extraction_id=%s
                    AND processor_version=%s AND processed_at=%s
                  ON CONFLICT(extraction_id,processor_version) DO UPDATE SET
                    processed_at=EXCLUDED.processed_at,object_uri=EXCLUDED.object_uri,
                    sha256=EXCLUDED.sha256,size_bytes=EXCLUDED.size_bytes,verified_at=now()
                  RETURNING extraction_id""",
                  (location,digest,size,row['extraction_id'],row['processor_version'],row['processed_at']))
                summary['copied' if receipt else 'superseded']+=1
                if receipt and self.retire_payloads:
                    await tx.query("""UPDATE scraping.processed_research SET payload=%s::jsonb
                      WHERE extraction_id=%s AND processor_version=%s AND processed_at=%s""",
                      (json.dumps(read_projection(payload),ensure_ascii=False,allow_nan=False,separators=(',',':')),
                       row['extraction_id'],row['processor_version'],row['processed_at']))
        return summary
