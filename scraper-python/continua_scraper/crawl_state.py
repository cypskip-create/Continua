"""Incremental crawl checkpoints with restart-safe claims and stale-worker CAS."""
from .artifacts import mapped

FIELDS={"id":"id","source_id":"sourceId","url":"url","canonical_url":"canonicalUrl","parent_url":"parentUrl","depth":"depth",
    "status":"status","mime_type":"mimeType","http_status":"httpStatus","content_hash":"contentHash","first_seen":"firstSeen",
    "last_seen":"lastSeen","last_crawled":"lastCrawled","last_changed":"lastChanged","error_reason":"errorReason"}

class CrawlState:
    def __init__(self,database):
        self.database=database

    async def discovered(self,source_id,url,depth,canonical_url=None,parent_url=None,revisit_minutes=1440):
        if type(depth) is not int or not 0<=depth<=6:
            raise ValueError("invalid crawl depth")
        rows=await self.database.query("""INSERT INTO scraping.crawl_state(source_id,url,canonical_url,parent_url,depth)
          VALUES(%s,%s,%s,%s,%s) ON CONFLICT(source_id,url) DO UPDATE SET
          status=CASE WHEN scraping.crawl_state.status IN ('crawled','failed')
            AND COALESCE(scraping.crawl_state.last_crawled,scraping.crawl_state.last_seen)<now()-(%s*interval '1 minute')
            THEN 'discovered' ELSE scraping.crawl_state.status END,
          last_seen=CASE WHEN scraping.crawl_state.status IN('queued','crawling') THEN scraping.crawl_state.last_seen ELSE now() END RETURNING *""",
          (source_id,url,canonical_url,parent_url,depth,max(5,revisit_minutes)))
        if not rows:
            raise RuntimeError("Discovery returned no checkpoint")
        return mapped(rows[0],FIELDS)

    async def claim(self,source_id,limit):
        if type(limit) is not int or not 1<=limit<=100:
            raise ValueError("invalid crawl batch")
        rows=await self.database.query("""UPDATE scraping.crawl_state SET status='queued',last_seen=now()
          WHERE id IN(SELECT id FROM scraping.crawl_state WHERE source_id=%s AND
            (status='discovered' OR (status IN('queued','crawling') AND last_seen<now()-interval '1 hour'))
            ORDER BY depth ASC,first_seen ASC LIMIT %s FOR UPDATE SKIP LOCKED) RETURNING *""",(source_id,limit))
        return [mapped(row,FIELDS) for row in rows]

    async def crawling(self,checkpoint_id,lease_seen):
        await self.database.query("UPDATE scraping.crawl_state SET status='crawling' WHERE id=%s AND last_seen=%s AND status='queued'",(checkpoint_id,lease_seen))

    async def crawled(self,checkpoint_id,lease_seen,http_status,mime_type,content_hash,changed):
        await self.database.query("""UPDATE scraping.crawl_state SET status='crawled',http_status=%s,mime_type=%s,content_hash=%s,
          last_crawled=now(),last_changed=CASE WHEN %s THEN now() ELSE last_changed END
          WHERE id=%s AND last_seen=%s AND status='crawling'""",(http_status,mime_type,content_hash,changed,checkpoint_id,lease_seen))

    async def failed(self,checkpoint_id,lease_seen,reason):
        await self.database.query("UPDATE scraping.crawl_state SET status='failed',error_reason=%s WHERE id=%s AND last_seen=%s AND status IN('queued','crawling')",(str(reason)[:1000],checkpoint_id,lease_seen))

    async def by_hash(self,source_id,digest):
        rows=await self.database.query("SELECT * FROM scraping.crawl_state WHERE source_id=%s AND content_hash=%s LIMIT 1",(source_id,digest))
        return mapped(rows[0],FIELDS) if rows else None
