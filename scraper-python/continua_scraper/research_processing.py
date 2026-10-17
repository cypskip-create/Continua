"""Bounded DB-only processing of archived evidence; no PDF proxying on Render."""
from .documents import encode
import re


async def reparse_archived_views(runtime,limit=2):
    """Upgrade old HTML extraction formats using budgeted private R2 reads.

    Called only inside the collector's reserved transfer budget, never by the
    DB-only maintenance path. No original is rewritten or copied to Render.
    """
    if type(limit) is not int or not 1<=limit<=5:raise ValueError('Invalid archive reparse batch')
    from .transfer_budget import active
    if active is None:raise ValueError('Archive reprocessing requires an active reserved transfer budget')
    rows=await runtime.database.query("""SELECT a.id FROM scraping.raw_artifacts a
      JOIN scraping.sources s ON s.id=a.source_id
      JOIN LATERAL (SELECT e.tables,e.entity FROM scraping.extractions e WHERE e.artifact_id=a.id
        ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1) e ON true
      WHERE a.source_id='kenyanstocks' AND s.enabled AND s.redistribution_allowed=true
        AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND a.content_type LIKE 'text/html%%' AND a.storage_path LIKE 'r2://continua-financial-documents/%%'
        AND a.metadata->>'ticker'=e.entity->>'ticker' AND a.metadata->>'tab' IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.tables)='array' THEN e.tables ELSE '[]'::jsonb END) t
          WHERE t->>'kind'='publisher_view')
      ORDER BY coalesce((SELECT max(d.last_failed) FROM scraping.dead_letters d
        WHERE d.source_id=a.source_id AND d.url=a.document_url AND d.stage='parse'),'epoch'::timestamptz),a.id LIMIT %s""",(limit,))
    summary={'examined':len(rows),'reprocessed':0,'failed':0}
    for row in rows:
        from .transfer_budget import TransferLimitReached
        try:
            await runtime.extraction.reprocess(row['id'])
            summary['reprocessed']+=1
        except TransferLimitReached:raise
        except Exception:
            summary['failed']+=1
            artifact=await runtime.evidence.artifact_by_id(row['id'])
            if artifact:await runtime.dead_letters.record(artifact['sourceId'],artifact['documentUrl'],'parse','Archive format upgrade failed; retry scheduled')
    return summary


class ResearchProcessor:
    def __init__(self,database):
        self.database=database

    async def available_financials(self):
        """Only observations passing the same current rights/evidence gates as API reads."""
        return await self.database.query("""SELECT symbol,category,observed_at,table_count,chart_series FROM (
          SELECT DISTINCT ON(sec.symbol,p.payload->>'category') sec.symbol,
            p.payload->>'category' AS category,p.payload->>'observedAt' AS observed_at,
            jsonb_array_length(p.payload->'tables') AS table_count,
            jsonb_array_length(p.payload->'charts') AS chart_series,e.extracted_at,e.id
          FROM scraping.processed_research p JOIN scraping.extractions e ON e.id=p.extraction_id
          JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
          JOIN market.securities sec ON sec.id=p.security_id
          WHERE p.processor_version='collected-research-v1' AND p.destination='financials'
            AND p.status='publisher_observation' AND s.enabled AND s.redistribution_allowed=true
            AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
            AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
          ORDER BY sec.symbol,p.payload->>'category',e.extracted_at DESC,e.id DESC
        ) latest WHERE table_count>0 ORDER BY extracted_at DESC,id DESC LIMIT 100""")

    async def stock_coverage(self):
        return await self.database.query("""SELECT sec.symbol,
          count(DISTINCT p.payload->>'category') FILTER(WHERE p.destination='financials')::integer AS financial_categories,
          count(DISTINCT p.destination) FILTER(WHERE p.destination<>'review')::integer AS processed_destinations,
          count(p.extraction_id) FILTER(WHERE p.destination='ownership' AND jsonb_array_length(coalesce(p.payload->'ownership','[]'::jsonb))>0)::integer AS ownership_snapshots
          FROM market.securities sec LEFT JOIN (
            SELECT p.* FROM scraping.processed_research p
            JOIN scraping.extractions e ON e.id=p.extraction_id
            JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
            WHERE p.processor_version='collected-research-v1' AND p.status='publisher_observation'
              AND s.enabled AND s.redistribution_allowed=true
              AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
              AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
          ) p ON p.security_id=sec.id
          WHERE sec.exchange='NSE' AND sec.status<>'delisted' GROUP BY sec.symbol ORDER BY sec.symbol""")

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
                    sec.id AS security_id,
                    md5(jsonb_build_array(s.enabled,s.redistribution_allowed,s.config->>'permissionReference',a.storage_path,a.sha256,sec.id)::text) AS gate_signature
                  FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
                  JOIN scraping.sources s ON s.id=a.source_id
                  LEFT JOIN market.securities sec ON sec.exchange='NSE' AND sec.symbol=
                    CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END
                  WHERE (a.source_id='kenyanstocks' OR a.content_type LIKE '%%application/pdf%%')
                  AND NOT EXISTS(SELECT 1 FROM scraping.processed_research p
                    WHERE p.extraction_id=e.id AND p.processor_version=%s AND NOT (
                      (p.status='blocked' AND p.gate_signature IS DISTINCT FROM
                        md5(jsonb_build_array(s.enabled,s.redistribution_allowed,s.config->>'permissionReference',a.storage_path,a.sha256,sec.id)::text))
                      OR (p.status<>'blocked' AND p.payload->>'presentationVersion' IS DISTINCT FROM '3')))
                  AND NOT EXISTS(SELECT 1 FROM scraping.extractions n WHERE n.artifact_id=e.artifact_id
                    AND n.entity->>'ticker' IS NOT DISTINCT FROM e.entity->>'ticker' AND (n.extracted_at,n.id)>(e.extracted_at,e.id))
                  ORDER BY (s.enabled AND s.redistribution_allowed=true AND sec.id IS NOT NULL
                    AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
                    AND a.sha256 ~ '^[a-f0-9]{64}$' AND a.storage_path LIKE 'r2://continua-financial-documents/%%') DESC NULLS LAST,
                    e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1""",(VERSION,))
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
                        issues=[]
                        if not allowed:issues.append({'code':'source_permission_unavailable'})
                        if not evidence:issues.append({'code':'private_verified_evidence_unavailable'})
                        if not row.get('security_id'):issues.append({'code':'exact_issuer_unavailable'})
                        payload={'version':VERSION,'status':'blocked','destination':'review','issues':issues}
                    else:
                        payload=process_evidence({'entity':row['entity'],'tables':row['tables'],'text':row['text'],
                            'method':row['method'],'needsReview':row['needs_review'],'sourceUrl':row['document_url'],
                            'contentType':row['content_type'],'metadata':row['metadata'],'title':row['title'],
                            'observedAt':row['retrieved_at'].isoformat()})
                except ValueError:
                    payload={'version':VERSION,'status':'review_required','destination':'review','issues':[{'code':'invalid_or_excessive_evidence'}]}
                payload['presentationVersion']=3
                serialized=encode(payload)
                if len(serialized.encode('utf-8'))>8*1024*1024:
                    payload={'version':VERSION,'presentationVersion':3,'status':'review_required','destination':'review','issues':[{'code':'processed_payload_budget_exceeded'}]}
                    serialized=encode(payload)
                await tx.query("""INSERT INTO scraping.processed_research(extraction_id,processor_version,security_id,destination,status,gate_signature,payload)
                  VALUES(%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT(extraction_id,processor_version)
                  DO UPDATE SET security_id=EXCLUDED.security_id,destination=EXCLUDED.destination,status=EXCLUDED.status,
                    gate_signature=EXCLUDED.gate_signature,payload=EXCLUDED.payload,processed_at=now()
                    WHERE processed_research.status='blocked' OR processed_research.payload->>'presentationVersion' IS DISTINCT FROM '3'""",
                  (row['id'],VERSION,row.get('security_id'),payload['destination'],payload['status'],row.get('gate_signature'),serialized))
                summary['processed']+=1
                summary[{'publisher_observation':'observations','review_required':'review'}.get(payload['status'],payload['status'])]+=1
                summary['destinations'][payload['destination']]=summary['destinations'].get(payload['destination'],0)+1
                summary['chartSeries']+=len(payload.get('charts') or [])
                summary['historyRows']+=len(payload.get('history') or [])
                summary['documentsIndexed']+=len(payload.get('documents') or [])
                for issue in payload.get('issues') or []:
                    code=issue['code'];summary['issueCounts'][code]=summary['issueCounts'].get(code,0)+issue.get('count',1)
        summary['companyContexts']=await self.refresh_company_contexts()
        return summary

    async def refresh_company_contexts(self):
        from continua_engine.company_context import company_context
        rows=await self.database.query("""SELECT DISTINCT ON(p.security_id,p.destination,p.payload->>'category')
          p.extraction_id,p.security_id,p.payload,e.extracted_at FROM scraping.processed_research p
          JOIN scraping.extractions e ON e.id=p.extraction_id JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
          JOIN scraping.sources s ON s.id=a.source_id
          WHERE a.source_id='kenyanstocks' AND p.processor_version='collected-research-v1'
            AND p.destination IN ('financials','overview') AND p.status='publisher_observation'
            AND s.enabled AND s.redistribution_allowed=true
            AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
            AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
          ORDER BY p.security_id,p.destination,p.payload->>'category',e.extracted_at DESC,e.id DESC LIMIT 2000""")
        groups={}
        for row in rows:groups.setdefault(row['security_id'],[]).append(row)
        count=0
        for records in groups.values():
            context=company_context([r['payload'] for r in records])
            if not context['history']:continue
            # Store the automatic Engine assembly alongside its existing evidence.
            # All contributors share the same publisher rights gate on API reads.
            anchor=max(records,key=lambda r:(r['extracted_at'],r['extraction_id']))
            await self.database.query("""UPDATE scraping.processed_research SET
              payload=jsonb_set(payload,'{companyResearch}',%s::jsonb),processed_at=now()
              WHERE extraction_id=%s AND processor_version='collected-research-v1'
                AND payload->'companyResearch' IS DISTINCT FROM %s::jsonb""",
              (encode(context),anchor['extraction_id'],encode(context)))
            count+=1
        return count

    async def inventory(self):
        rows=await self.database.query("""SELECT count(*)::integer AS extractions,
          count(*) FILTER(WHERE a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$')::integer AS private_evidence,
          count(*) FILTER(WHERE s.enabled AND s.redistribution_allowed=true AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200)::integer AS permission_ready,
          count(*) FILTER(WHERE e.entity->>'ticker' IS NOT NULL)::integer AS ticker_scoped,
          count(*) FILTER(WHERE sec.id IS NOT NULL)::integer AS known_issuer
          FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
          LEFT JOIN market.securities sec ON sec.exchange='NSE' AND sec.symbol=
            CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END
          WHERE a.source_id='kenyanstocks'""")
        return rows[0] if rows else {}
