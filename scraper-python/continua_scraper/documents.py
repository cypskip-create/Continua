"""Durable discovery/lease/retry ledger. Restart recovery never needs heap queues."""
import json

def encode(value):
    return json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(",",":"))

class DocumentJobs:
    def __init__(self,database,*,max_attempts=None):
        if max_attempts is not None and (type(max_attempts) is not int or not 1<=max_attempts<=10):raise ValueError('Invalid durable retry ceiling')
        self.database=database
        self.max_attempts=max_attempts

    async def enqueue(self,source_id,documents):
        refresh="""document_jobs.status='complete' AND (document_jobs.updated_at < now()-interval '7 days'
          OR (document_jobs.source_id='kenyanstocks' AND NOT EXISTS(
            SELECT 1 FROM scraping.raw_artifacts a WHERE a.source_id=document_jobs.source_id
              AND (a.document_url=document_jobs.url OR a.metadata->>'requestedUrl'=document_jobs.url)
              AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
              AND EXISTS(SELECT 1 FROM scraping.extractions e WHERE e.artifact_id=a.id
                AND e.entity->>'ticker' IS NOT DISTINCT FROM EXCLUDED.document->'context'->>'ticker'))))"""
        for offset in range(0,len(documents),200):
            await self.database.query(f"""INSERT INTO scraping.document_jobs(source_id,url,document)
              SELECT %s, item->>'url', item FROM jsonb_array_elements(%s::jsonb) item
              ON CONFLICT(source_id,url) DO UPDATE SET document=EXCLUDED.document,
                attempts=CASE WHEN {refresh}
                  THEN 0 ELSE document_jobs.attempts END,
                next_attempt_at=CASE WHEN {refresh}
                  THEN now() ELSE document_jobs.next_attempt_at END,
                updated_at=CASE WHEN {refresh}
                  THEN now() ELSE document_jobs.updated_at END,
                status=CASE WHEN {refresh}
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

    async def recover_unarchived(self,source_id,limit=1000):
        if source_id!='kenyanstocks' or type(limit) is not int or not 1<=limit<=2000:raise ValueError('Invalid private-evidence recovery scope')
        rows=await self.database.query("""WITH missing AS (
          SELECT j.id FROM scraping.document_jobs j WHERE j.source_id=%s AND j.status='complete'
            AND NOT EXISTS(SELECT 1 FROM scraping.raw_artifacts a WHERE a.source_id=j.source_id
              AND (a.document_url=j.url OR a.metadata->>'requestedUrl'=j.url)
              AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
              AND EXISTS(SELECT 1 FROM scraping.extractions e WHERE e.artifact_id=a.id
                AND e.entity->>'ticker' IS NOT DISTINCT FROM j.document->'context'->>'ticker'))
          ORDER BY j.id FOR UPDATE OF j SKIP LOCKED LIMIT %s
        ), recovered AS (UPDATE scraping.document_jobs j SET status='pending',attempts=0,next_attempt_at=now(),
          updated_at=now(),error_reason='Missing private issuer evidence; automatic recollection pending'
          FROM missing WHERE j.id=missing.id RETURNING j.id)
        SELECT count(*)::integer AS requeued FROM recovered""",(source_id,limit))
        return rows[0]['requeued'] if rows else 0

    async def refresh_documents(self,source_id,documents):
        """Explicit fresh batch: retain originals and never steal active leases."""
        if not 1<=len(documents)<=25:raise ValueError('Invalid fresh document batch')
        await self.database.query("""UPDATE scraping.document_jobs SET status='pending',attempts=0,
          next_attempt_at=now(),updated_at=now(),error_reason=NULL,lease_until=NULL
          WHERE source_id=%s AND url=ANY(%s::text[])
          AND (status<>'processing' OR lease_until<now())""",(source_id,[d['url'] for d in documents]))

    async def claim(self,source_id,limit,*,lane=None,issuer=None):
        if type(limit) is not int or not 1<=limit<=25:
            raise ValueError("invalid document batch")
        sql="""WITH pending AS (
          SELECT id FROM scraping.document_jobs WHERE source_id=%s AND
            ((status IN ('pending','failed') AND next_attempt_at<=now()) OR (status='processing' AND lease_until<now()))
          ORDER BY attempts,CASE WHEN source_id='kenyanstocks' THEN
            CASE WHEN url ~* '\\.pdf($|[?])' THEN 0 WHEN document->'context'->>'tab'='Files' THEN 1
              WHEN document->'context'->>'tab'='Financials' THEN 2 ELSE 3 END ELSE 0 END,
            updated_at,id FOR UPDATE SKIP LOCKED LIMIT %s)
          UPDATE scraping.document_jobs j SET status='processing',attempts=j.attempts+1,
            lease_until=now()+interval '2 hours',updated_at=now()
          FROM pending WHERE j.id=pending.id RETURNING j.id,j.document,j.attempts"""
        values=[source_id]
        if issuer is not None:
            import re
            if not isinstance(issuer,str) or not re.fullmatch('[A-Z0-9-]{1,20}',issuer):raise ValueError('Invalid issuer')
            sql=sql.replace('ORDER BY attempts,',"AND document->'context'->>'ticker'=%s AND document->'context'->>'tab'='Financials' ORDER BY attempts,")
            values.append(issuer)
        if self.max_attempts is not None:
            sql=sql.replace('ORDER BY attempts,','AND attempts<%s ORDER BY attempts,')
            values.append(self.max_attempts)
        if lane is not None:
            if lane not in ('Files','Financials','Summary','News','Corporate Actions','Historical Data','Holders','Statistics','PDF'):
                raise ValueError('Invalid document lane')
            sql=sql.replace('ORDER BY attempts,',"""ORDER BY CASE WHEN
              (CASE WHEN url ~* '\\.pdf($|[?])' THEN 'PDF' ELSE document->'context'->>'tab' END)=%s
              THEN 0 ELSE 1 END,attempts,""")
            values.append(lane)
        return await self.database.query(sql,tuple([*values,limit]))

    async def finish(self,job_id,attempts,error=None):
        # Attempt token prevents an expired worker overwriting a newer claim.
        await self.database.query("""UPDATE scraping.document_jobs SET status=%s,error_reason=%s,lease_until=NULL,
          next_attempt_at=now()+interval '1 hour',updated_at=now() WHERE id=%s AND attempts=%s""",
          ("failed" if error else "complete",str(error)[:1000] if error else None,job_id,attempts))
