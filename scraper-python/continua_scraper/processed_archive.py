"""Immutable private processed objects, separately namespaced from originals.

Retain the SQL read projection until reader cutover is independently verified.
An export receipt never means the original payload can safely be deleted.
"""
import asyncio
import gzip
import hashlib
import pathlib
import re
import tempfile
from .archive import snapshot_encoder
from .download import Artifact
from .r2 import R2Storage


class ProcessedArchive:
    def __init__(self,database,storage):
        self.database=database
        self.storage=R2Storage(storage.client,storage.bucket,dual_write=False,
            max_bytes=storage.max_bytes,transfers=storage.transfers)

    def copy(self,row):
        version=row['processor_version']
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',version):
            raise ValueError('Invalid processed object version')
        value={'schemaVersion':1,'kind':'processed-research','extractionId':row['extraction_id'],
               'processorVersion':version,'securityId':row['security_id'],
               'destination':row['destination'],'status':row['status'],'payload':row['payload']}
        decoded=0
        with tempfile.TemporaryDirectory(prefix='continua-processed-') as directory:
            path=pathlib.Path(directory)/'research.json.gz'
            with path.open('xb') as body,gzip.GzipFile(fileobj=body,mode='wb',filename='',mtime=0,compresslevel=6) as compressed:
                for part in snapshot_encoder().iterencode(value):
                    chunk=part.encode('utf-8');decoded+=len(chunk)
                    if decoded>self.storage.max_bytes:raise ValueError('Processed snapshot exceeds limit')
                    compressed.write(chunk)
            size=path.stat().st_size
            if not 1<=size<=self.storage.max_bytes:raise ValueError('Processed snapshot exceeds limit')
            with path.open('rb') as body:digest=hashlib.file_digest(body,'sha256').hexdigest()
            key=f"processed/research/{version}/{row['extraction_id']}/{digest}.json.gz"
            location=self.storage.upload(key,Artifact(path,'https://fixture.invalid/never-fetched','application/gzip',size,digest))
        return location,digest,size

    async def run(self,limit=25):
        if type(limit) is not int or not 1<=limit<=100:raise ValueError('Invalid processed archive batch')
        summary={'copied':0,'failed':0,'superseded':0}
        # One body per transaction; locks prevent duplicate work across workers.
        # The timestamp condition notices company-context or processor updates.
        for _ in range(limit):
            async with self.database.transaction() as tx:
                rows=await tx.query("""SELECT p.* FROM scraping.processed_research p
                  LEFT JOIN scraping.processed_cloud_archive c USING(extraction_id,processor_version)
                  WHERE c.processed_at IS DISTINCT FROM p.processed_at
                  ORDER BY (p.status='publisher_observation') DESC,p.processed_at,p.extraction_id
                  FOR UPDATE OF p SKIP LOCKED LIMIT 1""")
                if not rows:break
                row=rows[0]
                try:location,digest,size=await asyncio.to_thread(self.copy,row)
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
        return summary
