"""Bounded native R2 backfill. No original or extraction version is deleted."""
import asyncio
import hashlib
import gzip
import json
import math
import pathlib
import tempfile
from datetime import datetime,date,timezone,timedelta
from decimal import Decimal
from .download import Artifact
from .r2 import R2Storage,safe_key

def snapshot_encoder():
    def convert(v):
        if isinstance(v,datetime):
            if v.tzinfo is None:raise ValueError("Unzoned snapshot timestamp")
            return v.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
        if isinstance(v,date):return v.isoformat()
        if isinstance(v,Decimal):
            n=float(v)
            if not math.isfinite(n):raise ValueError("Invalid snapshot number")
            return n
        raise TypeError("Unsupported snapshot field")
    return json.JSONEncoder(default=convert,allow_nan=False,ensure_ascii=False,separators=(",",":"))

def snapshot_json(value):return snapshot_encoder().encode(value).encode()

def read_snapshot(path,*,format='json-v1',max_bytes=50*1024*1024):
    """Restore both retained plain JSON and new compressed evidence snapshots.

    Call only after private object/hash verification. Limit decoded bytes too;
    a small gzip object must never permit an unbounded decompression allocation.
    """
    if format not in ('json-v1','gzip-json-v1'):raise ValueError('Unknown snapshot format')
    opener=gzip.open if format=='gzip-json-v1' else open
    with opener(path,'rb') as body:payload=body.read(max_bytes+1)
    if len(payload)>max_bytes:raise ValueError('Decoded snapshot exceeds limit')
    value=json.loads(payload,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Invalid snapshot number')))
    if not isinstance(value,dict) or value.get('schemaVersion')!=1 or not isinstance(value.get('extraction'),dict):raise ValueError('Invalid extraction snapshot')
    return value

class R2Archive:
    def __init__(self,database,storage,legacy_reader,*,enabled=True):
        self.database,self.storage,self.legacy_reader=database,storage,legacy_reader
        self.enabled=enabled
        self._task=None
        self._closed=False

    async def run(self,limit=5):
        if self._closed:raise RuntimeError("Archive worker closed")
        if self._task is not None and not self._task.done():
            return await asyncio.shield(self._task)
        if not self.enabled:return {"copied":0,"failed":0,"disabled":True}
        if type(limit) is not int or not 1<=limit<=20:raise ValueError("Archive batch must be 1–20")
        # A disconnected operator request cannot abandon a verified upload/CAS.
        # The service must call close() during graceful shutdown.
        self._task=asyncio.create_task(self._run(limit))
        return await asyncio.shield(self._task)

    async def close(self):
        self._closed=True
        if self._task is not None:
            await asyncio.shield(self._task)

    def _copy_raw(self,row):
        old=row["storage_path"]
        if old.startswith("r2://"):
            return self.storage.key_from_location(old)
        key=safe_key(old.replace("\\","/"))
        # The original private reader is injected, never a user-provided URL.
        # Archive copies already have a retained original: no redundant rollback
        # write. Originals remain readable; new writes default to R2 only.
        archive_storage=R2Storage(self.storage.client,self.storage.bucket,dual_write=False,max_bytes=self.storage.max_bytes,transfers=self.storage.transfers)
        with self.legacy_reader(old) as artifact:
            if artifact.size!=row["size_bytes"] or artifact.sha256!=row["sha256"]:
                raise ValueError("Archive source content mismatch")
            archive_storage.upload(key,artifact)
        return key

    def _copy_snapshot(self,row,key,snapshot):
        value={"schemaVersion":1,"artifactId":row["id"],"sourceId":row["source_id"],"documentUrl":row["document_url"],"rawObject":f"r2://{self.storage.bucket}/{key}","extraction":snapshot}
        with tempfile.TemporaryDirectory(prefix="continua-r2-snapshot-") as directory:
            path=pathlib.Path(directory)/"snapshot.json.gz"
            decoded=0
            # Deterministic gzip (no wall-clock or temporary-path fields).
            # Stream the JSON encoder directly into a temporary compressed file.
            with path.open('xb') as body,gzip.GzipFile(fileobj=body,mode='wb',filename='',mtime=0,compresslevel=6) as compressed:
                for part in snapshot_encoder().iterencode(value):
                    chunk=part.encode();decoded+=len(chunk)
                    if decoded>self.storage.max_bytes:raise ValueError('Snapshot exceeds response limit')
                    compressed.write(chunk)
            size=path.stat().st_size
            if size>self.storage.max_bytes:raise ValueError('Compressed snapshot exceeds response limit')
            digest=hashlib.sha256()
            with path.open('rb') as body:
                while chunk:=body.read(65536):digest.update(chunk)
            digest=digest.hexdigest()
            snapshot_key=safe_key(f"extractions/{row['source_id']}/{row['id']}/{digest}.json.gz")
            storage=R2Storage(self.storage.client,self.storage.bucket,dual_write=False,max_bytes=self.storage.max_bytes,transfers=self.storage.transfers)
            return storage.upload(snapshot_key,Artifact(path,row["document_url"],"application/gzip",size,digest))

    async def _run(self,limit):
        pending=await self.database.query("""SELECT a.*,e.id AS extraction_id FROM scraping.raw_artifacts a
          LEFT JOIN LATERAL (SELECT * FROM scraping.extractions WHERE artifact_id=a.id
            AND id>COALESCE(NULLIF(a.metadata->>'r2ExtractionId','')::bigint,0)
            ORDER BY id ASC LIMIT 1) e ON true
          WHERE (a.storage_path NOT LIKE 'r2://%%' OR e.id IS NOT NULL)
            AND COALESCE(NULLIF(a.metadata->>'r2ArchiveRetryAt','')::timestamptz,'epoch'::timestamptz)<now()
          ORDER BY (a.content_type LIKE '%%pdf%%') DESC,a.id LIMIT %s""",(limit,))
        summary={"copied":0,"failed":0,"superseded":0}
        for row in pending:
            try:
                old=row["storage_path"]
                prior_version=str((row.get("metadata") or {}).get("r2ExtractionId") or "")
                key=await asyncio.to_thread(self._copy_raw,row)
                metadata={"r2ArchivedAt":datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z"),"r2ArchiveRetryAt":""}
                if row.get("extraction_id"):
                    snapshots=await self.database.query("SELECT * FROM scraping.extractions WHERE id=%s AND artifact_id=%s",(row["extraction_id"],row["id"]))
                    if not snapshots:raise ValueError("Extraction snapshot disappeared")
                    metadata["r2ExtractionObject"]=await asyncio.to_thread(self._copy_snapshot,row,key,snapshots[0])
                    metadata["r2ExtractionId"]=str(row["extraction_id"])
                    metadata['r2ExtractionFormat']='gzip-json-v1'
                updated=await self.database.query("""UPDATE scraping.raw_artifacts SET storage_path=%s,
                    metadata=COALESCE(metadata,'{}'::jsonb)||%s::jsonb WHERE id=%s AND storage_path=%s
                    AND COALESCE(metadata->>'r2ExtractionId','')=%s RETURNING id""",
                    (f"r2://{self.storage.bucket}/{key}",json.dumps(metadata),row["id"],old,prior_version))
                summary["copied" if updated else "superseded"]+=1
            except Exception:
                summary["failed"]+=1
                retry=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(timespec="milliseconds").replace("+00:00","Z")
                # Error detail can contain private URLs/credentials; don't log it.
                await self.database.query("UPDATE scraping.raw_artifacts SET metadata=COALESCE(metadata,'{}'::jsonb)||%s::jsonb WHERE id=%s AND storage_path=%s AND COALESCE(metadata->>'r2ExtractionId','')=%s",
                                          (json.dumps({"r2ArchiveRetryAt":retry}),row["id"],row["storage_path"],str((row.get("metadata") or {}).get("r2ExtractionId") or "")))
        return summary
