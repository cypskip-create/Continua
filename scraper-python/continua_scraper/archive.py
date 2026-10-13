"""Bounded native R2 backfill. No original or extraction version is deleted."""
import asyncio
import hashlib
import json
import math
import pathlib
import tempfile
from datetime import datetime,date,timezone,timedelta
from decimal import Decimal
from .download import Artifact
from .r2 import R2Storage,safe_key

def snapshot_json(value):
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
    return json.dumps(value,default=convert,allow_nan=False,ensure_ascii=False,separators=(",",":")).encode()

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
        # write, and no change to collection's required dual-write policy.
        archive_storage=R2Storage(self.storage.client,self.storage.bucket,dual_write=False,max_bytes=self.storage.max_bytes)
        with self.legacy_reader(old) as artifact:
            if artifact.size!=row["size_bytes"] or artifact.sha256!=row["sha256"]:
                raise ValueError("Archive source content mismatch")
            archive_storage.upload(key,artifact)
        return key

    def _copy_snapshot(self,row,key,snapshot):
        payload=snapshot_json({"schemaVersion":1,"artifactId":row["id"],"sourceId":row["source_id"],"documentUrl":row["document_url"],"rawObject":f"r2://{self.storage.bucket}/{key}","extraction":snapshot})
        if len(payload)>self.storage.max_bytes:raise ValueError("Snapshot exceeds response limit")
        digest=hashlib.sha256(payload).hexdigest()
        snapshot_key=safe_key(f"extractions/{row['source_id']}/{row['id']}/{digest}.json")
        with tempfile.TemporaryDirectory(prefix="continua-r2-snapshot-") as directory:
            path=pathlib.Path(directory)/"snapshot.json"
            with path.open("xb") as body:body.write(payload)
            storage=R2Storage(self.storage.client,self.storage.bucket,dual_write=False,max_bytes=self.storage.max_bytes)
            return storage.upload(snapshot_key,Artifact(path,row["document_url"],"application/json",len(payload),digest))

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
