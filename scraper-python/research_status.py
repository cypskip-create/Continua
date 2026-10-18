"""Private DB-only NSE coverage CLI. Never reads R2 originals or user workspaces.

python scraper-python/research_status.py
python scraper-python/research_status.py --ticker CGEN
python scraper-python/research_status.py --ticker CGEN --retry-failed

Requires DATABASE_URL for the existing private backend database role and the
canonical-observations migration. Does not print credentials or database errors.
"""
import argparse
import asyncio
import json
import os
import re
from continua_scraper.database import Database
from continua_scraper.event_loop import database_event_loop


COVERAGE_SQL="""SELECT sec.symbol, sec.id AS security_id,
    coalesce(receipts.last_processed::text,NULL) AS last_processed,
    coalesce(receipts.latest_source_date::text,NULL) AS latest_source_date,
    coalesce(receipts.pending,0)::integer AS pending,
    coalesce(receipts.blocked,0)::integer AS blocked,
    coalesce(receipts.review,0)::integer AS review,
    coalesce(receipts.failed,0)::integer AS failed,
    coalesce(receipts.next_retry::text,NULL) AS next_retry,
    financials.periods,financials.source_backed_periods,financials.complete_periods,
    EXISTS(SELECT 1 FROM market.afri_scores score WHERE score.security_id=sec.id
      AND score.afri_score IS NOT NULL) AS stored_rating_available
  FROM market.securities sec
  LEFT JOIN LATERAL (
    SELECT max(p.processed_at) AS last_processed,max(a.retrieved_at) AS latest_source_date,
      count(*) FILTER(WHERE p.extraction_id IS NULL) AS pending,
      count(*) FILTER(WHERE p.status='blocked') AS blocked,
      count(*) FILTER(WHERE p.status='review_required') AS review,
      count(*) FILTER(WHERE d.attempts IS NOT NULL) AS failed,
      min(d.last_failed+make_interval(secs=>least(3600,30*power(2,least(d.attempts,7)))::integer))
        FILTER(WHERE d.attempts<5) AS next_retry
    FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
    LEFT JOIN scraping.processed_research p ON p.extraction_id=e.id
      AND p.processor_version='collected-research-v1'
    LEFT JOIN scraping.dead_letters d ON d.source_id=a.source_id AND d.url=a.document_url
      AND d.stage='research-collected-research-v1:'||e.id::text AND p.extraction_id IS NULL
    WHERE CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC'
      WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END=sec.symbol
      AND (a.source_id='kenyanstocks' OR a.content_type LIKE '%%application/pdf%%')
      AND NOT EXISTS(SELECT 1 FROM scraping.extractions newer WHERE newer.artifact_id=e.artifact_id
        AND newer.entity->>'ticker' IS NOT DISTINCT FROM e.entity->>'ticker'
        AND (newer.extracted_at,newer.id)>(e.extracted_at,e.id))
  ) receipts ON true
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS periods,
      count(*) FILTER(WHERE jsonb_array_length(coalesce(f->'sourceUrls','[]'::jsonb))>0)::integer AS source_backed_periods,
      count(*) FILTER(WHERE jsonb_typeof(f->'revenue')='number'
        AND jsonb_typeof(f->'netIncome')='number' AND jsonb_typeof(f->'eps')='number')::integer AS complete_periods
    FROM market.canonical_financial_history(sec.id,'annual',100,false) f
  ) financials
  WHERE sec.exchange='NSE' AND sec.status<>'delisted' AND (%s::text IS NULL OR sec.symbol=%s)
  ORDER BY sec.symbol"""


def summarize(rows):
    counts={key:0 for key in ('completed','partially_completed','failed','pending','discovered')}
    for row in rows:
        if row['periods']:
            state='completed' if row['complete_periods']==row['periods'] and not any(row[k] for k in ('pending','blocked','review','failed')) else 'partially_completed'
        elif row['failed']:
            state='failed'
        elif row['pending']:
            state='pending'
        else:
            state='discovered'
        row['processing_status']=state
        counts[state]+=1
    return {'supported_tickers':len(rows),'counts':counts,'tickers':rows,
            'scope':'Annual observation coverage; completed does not certify licensing, rating quality, forecast accuracy or full financial taxonomy completeness.'}


async def run(ticker=None,retry=False):
    if ticker is not None and not re.fullmatch(r'[A-Z0-9.\-]{1,20}',ticker):raise ValueError('Invalid ticker')
    if retry and not ticker:raise ValueError('Select one ticker for an explicit retry')
    database=await Database.open(os.environ.get('DATABASE_URL',''))
    try:
        if retry:
            # Existing SKIP LOCKED processing remains the sole worker. Releasing
            # retry eligibility never writes financial amounts or raw evidence.
            await database.query("""UPDATE scraping.dead_letters d SET attempts=0,
              last_failed='epoch',reason='Operator requested Engine retry'
              FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
              JOIN market.securities sec ON sec.exchange='NSE' AND sec.symbol=%s
              WHERE d.source_id=a.source_id AND d.url=a.document_url
                AND d.stage='research-collected-research-v1:'||e.id::text
                AND CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC'
                  WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END=sec.symbol""",(ticker,))
        return summarize(await database.query(COVERAGE_SQL,(ticker,ticker)))
    finally:await database.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ticker',type=str.upper)
    parser.add_argument('--retry-failed',action='store_true')
    options=parser.parse_args()
    try:
        print(json.dumps(asyncio.run(run(options.ticker,options.retry_failed),loop_factory=database_event_loop),default=str))
    except Exception:
        parser.exit(1,'Research status unavailable. Check private database configuration and required migrations.\n')
