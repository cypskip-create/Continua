"""Durable discovery/lease/retry ledger. Restart recovery never needs heap queues."""
import json

def encode(value):
    return json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(",",":"))

class DocumentJobs:
    def __init__(self,database):
        self.database=database

    async def enqueue(self,source_id,documents):
        for offset in range(0,len(documents),200):
            await self.database.query("""INSERT INTO scraping.document_jobs(source_id,url,document)
              SELECT %s, item->>'url', item FROM jsonb_array_elements(%s::jsonb) item
              ON CONFLICT(source_id,url) DO UPDATE SET document=EXCLUDED.document,
                status=CASE WHEN document_jobs.status='complete' AND document_jobs.updated_at < now()-interval '7 days'
                THEN 'pending' ELSE document_jobs.status END""",(source_id,encode(documents[offset:offset+200])))

    async def requeue_incomplete(self,source_id,limit):
        if type(limit) is not int or not 1<=limit<=100:
            raise ValueError("invalid recovery batch")
        await self.database.query("""WITH incomplete AS (
          SELECT j.id FROM scraping.document_jobs j WHERE j.source_id=%s AND j.status='complete'
            AND EXISTS(SELECT 1 FROM LATERAL (
              SELECT a.id FROM scraping.raw_artifacts a WHERE a.source_id=j.source_id AND a.document_url=j.url
              ORDER BY a.retrieved_at DESC,a.id DESC LIMIT 1) artifact
              JOIN LATERAL (SELECT e.method,e.text FROM scraping.extractions e WHERE e.artifact_id=artifact.id
                ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1) latest ON true
              WHERE latest.method IN ('native_pdf_text','ocr') AND length(trim(coalesce(latest.text,'')))<50)
          ORDER BY j.id FOR UPDATE SKIP LOCKED LIMIT %s)
          UPDATE scraping.document_jobs j SET status='pending',next_attempt_at=now(),updated_at=now(),
            error_reason='Recovering incomplete legacy PDF extraction'
          FROM incomplete WHERE j.id=incomplete.id""",(source_id,limit))

    async def claim(self,source_id,limit):
        if type(limit) is not int or not 1<=limit<=25:
            raise ValueError("invalid document batch")
        return await self.database.query("""WITH pending AS (
          SELECT id FROM scraping.document_jobs WHERE source_id=%s AND
            ((status IN ('pending','failed') AND next_attempt_at<=now()) OR (status='processing' AND lease_until<now()))
          ORDER BY attempts,CASE WHEN source_id='kenyanstocks' THEN
            CASE WHEN url ~* '\\.pdf($|[?])' THEN 0 WHEN document->'context'->>'tab'='Files' THEN 1
              WHEN document->'context'->>'tab'='Financials' THEN 2 ELSE 3 END ELSE 0 END,
            created_at,id FOR UPDATE SKIP LOCKED LIMIT %s)
          UPDATE scraping.document_jobs j SET status='processing',attempts=j.attempts+1,
            lease_until=now()+interval '2 hours',updated_at=now()
          FROM pending WHERE j.id=pending.id RETURNING j.id,j.document,j.attempts""",(source_id,limit))

    async def finish(self,job_id,attempts,error=None):
        # Attempt token prevents an expired worker overwriting a newer claim.
        await self.database.query("""UPDATE scraping.document_jobs SET status=%s,error_reason=%s,lease_until=NULL,
          next_attempt_at=now()+interval '1 hour',updated_at=now() WHERE id=%s AND attempts=%s""",
          ("failed" if error else "complete",str(error)[:1000] if error else None,job_id,attempts))
