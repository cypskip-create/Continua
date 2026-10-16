"""Bounded DB-only processing of archived evidence; no PDF proxying on Render."""
from .documents import encode
import re


class ResearchProcessor:
    def __init__(self,database):
        self.database=database

    async def run(self,limit=25):
        from continua_engine.collected import process_evidence,VERSION
        if type(limit) is not int or not 1<=limit<=100:raise ValueError('Invalid processing batch')
        summary={'processed':0,'observations':0,'review':0,'empty':0,'blocked':0,'failed':0,'version':VERSION,
                 'destinations':{},'chartSeries':0,'historyRows':0,'documentsIndexed':0,'issueCounts':{}}
        issuers=None
        for _ in range(limit):
            # One evidence body at a time. Transaction lock + versioned receipt
            # makes concurrent Actions jobs/restarts safe without a live service.
            async with self.database.transaction() as tx:
                rows=await tx.query("""SELECT e.id,e.method,e.text,e.tables,e.entity,e.needs_review,
                    a.document_url,a.content_type,a.metadata,a.title,a.source_id,a.sha256,a.storage_path,
                    a.retrieved_at,s.enabled,s.redistribution_allowed,s.config,
                    sec.id AS security_id
                  FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
                  JOIN scraping.sources s ON s.id=a.source_id
                  LEFT JOIN market.securities sec ON sec.exchange='NSE' AND sec.symbol=
                    CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END
                  WHERE (a.source_id='kenyanstocks' OR a.content_type LIKE '%%application/pdf%%')
                  AND NOT EXISTS(SELECT 1 FROM scraping.processed_research p
                    WHERE p.extraction_id=e.id AND p.processor_version=%s AND NOT (
                      p.status='blocked' AND sec.id IS NOT NULL AND s.enabled AND s.redistribution_allowed=true
                      AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
                      AND a.sha256 ~ '^[a-f0-9]{64}$' AND a.storage_path LIKE 'r2://continua-financial-documents/%%'))
                  AND NOT EXISTS(SELECT 1 FROM scraping.extractions n WHERE n.artifact_id=e.artifact_id
                    AND n.entity->>'ticker' IS NOT DISTINCT FROM e.entity->>'ticker' AND (n.extracted_at,n.id)>(e.extracted_at,e.id))
                  ORDER BY e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1""",(VERSION,))
                if not rows:break
                row=rows[0]
                reference=(row.get('config') or {}).get('permissionReference')
                allowed=row['enabled'] and row['redistribution_allowed'] is True and isinstance(reference,str) and 1<=len(reference.strip())<=200
                evidence=bool(re.fullmatch('[a-f0-9]{64}',row.get('sha256') or '')) and (row.get('storage_path') or '').startswith('r2://continua-financial-documents/')
                identity_conflict=False
                if allowed and evidence and 'pdf' in (row.get('content_type') or ''):
                    from continua_engine.publisher import issuer_masthead_matches
                    if issuers is None:
                        issuers=await tx.query("""SELECT s.id,s.symbol,c.name FROM market.securities s
                          JOIN market.companies c ON c.id=s.company_id WHERE s.exchange='NSE' AND s.status<>'delisted'""")
                    matches=[issuer for issuer in issuers if issuer_masthead_matches(row.get('text') or '',issuer['name'])]
                    if len(matches)==1:
                        issuer=matches[0]
                        if row.get('security_id') and row['security_id']!=issuer['id']:identity_conflict=True
                        elif not row.get('security_id'):
                            row=dict(row,security_id=issuer['id'],entity={'ticker':issuer['symbol'],'exchange':'NSE'})
                try:
                    if identity_conflict:
                        payload={'version':VERSION,'status':'review_required','destination':'review','issues':[{'code':'document_issuer_context_conflict'}]}
                    elif not allowed or not evidence or not row.get('security_id'):
                        payload={'version':VERSION,'status':'blocked','destination':'review','issues':[{'code':'source_permission_evidence_or_issuer_missing'}]}
                    else:
                        payload=process_evidence({'entity':row['entity'],'tables':row['tables'],'text':row['text'],
                            'method':row['method'],'needsReview':row['needs_review'],'sourceUrl':row['document_url'],
                            'contentType':row['content_type'],'metadata':row['metadata'],'title':row['title'],
                            'observedAt':row['retrieved_at'].isoformat()})
                except ValueError:
                    payload={'version':VERSION,'status':'review_required','destination':'review','issues':[{'code':'invalid_or_excessive_evidence'}]}
                serialized=encode(payload)
                if len(serialized.encode('utf-8'))>8*1024*1024:
                    payload={'version':VERSION,'status':'review_required','destination':'review','issues':[{'code':'processed_payload_budget_exceeded'}]}
                    serialized=encode(payload)
                await tx.query("""INSERT INTO scraping.processed_research(extraction_id,processor_version,security_id,destination,status,payload)
                  VALUES(%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT(extraction_id,processor_version)
                  DO UPDATE SET security_id=EXCLUDED.security_id,destination=EXCLUDED.destination,status=EXCLUDED.status,
                    payload=EXCLUDED.payload,processed_at=now() WHERE processed_research.status='blocked'""",
                  (row['id'],VERSION,row.get('security_id'),payload['destination'],payload['status'],serialized))
                summary['processed']+=1
                summary[{'publisher_observation':'observations','review_required':'review'}.get(payload['status'],payload['status'])]+=1
                summary['destinations'][payload['destination']]=summary['destinations'].get(payload['destination'],0)+1
                summary['chartSeries']+=len(payload.get('charts') or [])
                summary['historyRows']+=len(payload.get('history') or [])
                summary['documentsIndexed']+=len(payload.get('documents') or [])
                for issue in payload.get('issues') or []:
                    code=issue['code'];summary['issueCounts'][code]=summary['issueCounts'].get(code,0)+issue.get('count',1)
        return summary
