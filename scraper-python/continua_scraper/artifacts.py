"""Immutable evidence/extraction repositories. No canonical publication here."""
from .documents import encode
import re

QUOTE_TRANSPORT=re.compile(r'^https://live\.mystocks\.co\.ke/x/f[0-9]+-([A-Z0-9.\-]{1,20})$')

ARTIFACT_FIELDS={"id":"id","source_id":"sourceId","adapter":"adapter","sha256":"sha256","document_url":"documentUrl",
    "source_url":"sourceUrl","parent_url":"parentUrl","content_type":"contentType","size_bytes":"sizeBytes","storage_path":"storagePath",
    "title":"title","published_at":"publishedAt","discovered_at":"discoveredAt","retrieved_at":"retrievedAt","crawler_version":"crawlerVersion","metadata":"metadata"}
EXTRACTION_FIELDS={"id":"id","artifact_id":"artifactId","method":"method","confidence":"confidence","parser_version":"parserVersion",
    "text":"text","tables":"tables","entity":"entity","needs_review":"needsReview","extracted_at":"extractedAt"}

def mapped(row,fields):
    return {target:row.get(source) for source,target in fields.items()} if row else None

class EvidenceRepository:
    def __init__(self,database):
        self.database=database

    async def artifact_by_hash(self,source_id,digest):
        rows=await self.database.query("SELECT * FROM scraping.raw_artifacts WHERE source_id=%s AND sha256=%s",(source_id,digest))
        return mapped(rows[0],ARTIFACT_FIELDS) if rows else None

    async def artifact_by_id(self,artifact_id):
        rows=await self.database.query("SELECT * FROM scraping.raw_artifacts WHERE id=%s",(artifact_id,))
        return mapped(rows[0],ARTIFACT_FIELDS) if rows else None

    async def upsert_artifact(self,artifact):
        # The caller supplies only a storage path returned by verified storage.
        # A transaction now makes hash/location/URL attribution commit together.
        async with self.database.transaction() as database:
            rows=await database.query("""INSERT INTO scraping.raw_artifacts
              (source_id,adapter,sha256,document_url,source_url,parent_url,content_type,size_bytes,
               storage_path,title,published_at,crawler_version,metadata)
              VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
              ON CONFLICT(source_id,sha256) DO UPDATE SET storage_path=EXCLUDED.storage_path,retrieved_at=now()
              RETURNING *, (xmax=0) AS is_new""",(
                  artifact["sourceId"],artifact["adapter"],artifact["sha256"],artifact["documentUrl"],artifact.get("sourceUrl"),
                  artifact.get("parentUrl"),artifact.get("contentType"),artifact.get("sizeBytes"),artifact["storagePath"],
                  artifact.get("title"),artifact.get("publishedAt"),artifact["crawlerVersion"],encode(artifact.get("metadata") or {})))
            if not rows:
                raise RuntimeError("Artifact persistence returned no record")
            row=rows[0]
            incoming=QUOTE_TRANSPORT.fullmatch(artifact['documentUrl']) if artifact['adapter']=='mystocks' else None
            original=QUOTE_TRANSPORT.fullmatch(row.get('document_url') or '') if incoming else None
            if row.get('is_new') is False and original and original[1]==incoming[1]:
                # Identical source bytes, same ticker, different transport nonce:
                # the first real URL is already retained atomically. Do not grow
                # millions of aliases while the market is closed/unchanged.
                pass
            elif incoming:
                # Identical bytes can legitimately be returned for two issuers.
                # Keep one actually fetched URL per ticker, not one per nonce.
                pattern=r'^https://live[.]mystocks[.]co[.]ke/x/f[0-9]+-'+re.escape(incoming[1])+r'$'
                await database.query("""INSERT INTO scraping.artifact_urls(artifact_id,url)
                  SELECT %s,%s WHERE NOT EXISTS(SELECT 1 FROM scraping.artifact_urls WHERE artifact_id=%s AND url ~ %s)
                  ON CONFLICT(artifact_id,url) DO NOTHING""",(row['id'],artifact['documentUrl'],row['id'],pattern))
            else:
                await database.query("INSERT INTO scraping.artifact_urls(artifact_id,url) VALUES(%s,%s) ON CONFLICT(artifact_id,url) DO NOTHING",(row["id"],artifact["documentUrl"]))
            return {"artifact":mapped(row,ARTIFACT_FIELDS),"isNew":row.get("is_new",True)}

    async def insert_extraction(self,extraction):
        rows=await self.database.query("""INSERT INTO scraping.extractions
          (artifact_id,method,confidence,parser_version,text,tables,entity,needs_review)
          VALUES(%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s) RETURNING *""",(
              extraction["artifactId"],extraction["method"],extraction["confidence"],extraction["parserVersion"],extraction.get("text"),
              encode(extraction.get("tables") or []),encode(extraction.get("entity") or {}),extraction["needsReview"]))
        if not rows:
            raise RuntimeError("Extraction persistence returned no record")
        return mapped(rows[0],EXTRACTION_FIELDS)

    async def latest_extraction(self,artifact_id):
        rows=await self.database.query("SELECT * FROM scraping.extractions WHERE artifact_id=%s ORDER BY extracted_at DESC,id DESC LIMIT 1",(artifact_id,))
        return mapped(rows[0],EXTRACTION_FIELDS) if rows else None

    async def latest_extraction_for_ticker(self,artifact_id,ticker):
        if not isinstance(ticker,str) or not re.fullmatch(r'[A-Z0-9.\-]{1,20}',ticker):raise ValueError('Invalid extraction scope')
        rows=await self.database.query("SELECT * FROM scraping.extractions WHERE artifact_id=%s AND entity->>'ticker'=%s ORDER BY extracted_at DESC,id DESC LIMIT 1",(artifact_id,ticker))
        return mapped(rows[0],EXTRACTION_FIELDS) if rows else None

    async def needs_review(self,limit=100):
        if type(limit) is not int or not 1<=limit<=100:
            raise ValueError("invalid review batch")
        rows=await self.database.query("""SELECT * FROM (
          SELECT DISTINCT ON(e.artifact_id) e.*,a.title,a.document_url,a.source_id
          FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
          ORDER BY e.artifact_id,e.extracted_at DESC,e.id DESC) latest
          WHERE needs_review=true ORDER BY extracted_at DESC LIMIT %s""",(limit,))
        return [{**mapped(row,EXTRACTION_FIELDS),"title":row["title"],"documentUrl":row["document_url"],"sourceId":row["source_id"]} for row in rows]

    async def unextracted(self,limit=50,driver="r2",rollback_bucket="scraper-raw"):
        if type(limit) is not int or not 1<=limit<=100:
            raise ValueError("invalid extraction batch")
        rows=await self.database.query("""SELECT a.id AS artifact_id,a.source_id,a.adapter,a.content_type,a.storage_path,a.document_url,a.sha256,a.size_bytes,a.metadata
          FROM scraping.raw_artifacts a LEFT JOIN LATERAL (
            SELECT e.id,e.text FROM scraping.extractions e WHERE e.artifact_id=a.id ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1) e ON true
          WHERE (e.id IS NULL OR (a.content_type ILIKE '%%pdf%%' AND length(trim(coalesce(e.text,'')))<50))
            AND (a.content_type ILIKE '%%pdf%%' OR a.content_type ILIKE '%%html%%')
            AND (%s::boolean=false OR EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=%s AND o.name=replace(a.storage_path,chr(92),'/')))
            AND NOT EXISTS(SELECT 1 FROM scraping.dead_letters d WHERE d.source_id=a.source_id AND d.url=a.document_url
              AND d.stage='parse' AND d.last_failed>now()-interval '1 hour')
          ORDER BY (a.content_type ILIKE '%%pdf%%') DESC,a.discovered_at ASC LIMIT %s""",(driver=="supabase",rollback_bucket,limit))
        fields={"artifact_id":"artifactId","source_id":"sourceId","adapter":"adapter","content_type":"contentType","storage_path":"storagePath","document_url":"documentUrl","sha256":"sha256","size_bytes":"sizeBytes","metadata":"metadata"}
        return [mapped(row,fields) for row in rows]
