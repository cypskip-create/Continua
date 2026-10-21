"""Bounded structured macro ingestion and evidence ledger publication.

First-seen time is conservative availability. A current WDI response is never
silently treated as a vintage known in the observation year.
"""
import hashlib
import json
import math
from datetime import datetime,timezone

VERSION='investment-evidence-v1'
INDICATORS={
 'NY.GDP.MKTP.KD.ZG':('gdp_growth','percent'),
 'FP.CPI.TOTL.ZG':('cpi_annual_inflation','percent'),
 'PA.NUS.FCRF':('official_exchange_rate_annual_average','KES per USD'),
 'FI.RES.TOTL.CD':('international_reserves_including_gold','USD'),
}


def worldbank_observations(payload,available):
    if not isinstance(payload,list) or len(payload)!=2 or payload[0].get('pages')!=1 or not isinstance(payload[1],list) or len(payload[1])>200:
        raise ValueError('Expected one bounded complete World Bank indicator response')
    result=[]
    for row in payload[1]:
        if row.get('countryiso3code')!='KEN':raise ValueError('Expected Kenya observations only')
        code=row['indicator']['id']
        if code not in INDICATORS:raise ValueError('Unreviewed macro indicator')
        value=row.get('value')
        if value is None:continue
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError('Invalid macro value')
        year=row.get('date','')
        if not year.isdigit() or not 1960<=int(year)<=int(available[:4]):raise ValueError('Invalid observation year')
        observed=year+'-12-31'
        if observed>available:continue # no completed-year observation fabricated
        series,unit=INDICATORS[code]
        result.append(dict(kind='macro',naturalKey=code,date=observed,availableAt=available,
            payload=dict(series=series,value=value,unit=unit,frequency='annual',indicator=code,
                provider='The World Bank: World Development Indicators and originating data providers',
                availabilityBasis='First retrieved vintage; original publication date unknown',
                providerLastUpdated=payload[0].get('lastupdated'))))
    return result


class WorldBankAdapter:
    parser_version=VERSION
    document_concurrency=1
    def __init__(self,io):self.io=io;self.id=io.source['id']
    async def discover(self):
        return [dict(url='https://api.worldbank.org/v2/country/KEN/indicator/'+code+'?format=json&per_page=200',
                     title='Kenya WDI '+code,context={'indicator':code}) for code in INDICATORS]
    async def fetch(self,document):
        if not await self.io.downloader.robots_allowed(document['url']):raise PermissionError('Macro API robots policy forbids retrieval')
        return await self.io.fetch_document(document,'worldbank',VERSION)
    async def parse(self,fetched):
        payload=json.loads(self.io.text(fetched['artifact']))
        rows=worldbank_observations(payload,datetime.now(timezone.utc).date().isoformat())
        return dict(method='html',text='Structured World Bank WDI JSON response',tables=[dict(kind='investment_observations',observations=rows)],
                    entity={'exchange':'N/A'},needsReview=False,confidence=None)


async def publish_investment_evidence(database,limit=10):
    """No network, no changed originals, no rights inferred from URL alone."""
    from .documents import encode
    if type(limit) is not int or not 1<=limit<=25:raise ValueError('Invalid publication batch')
    rows=await database.query("""SELECT e.id,e.tables,e.parser_version,a.id AS artifact_id,a.retrieved_at
      FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
      JOIN scraping.sources s ON s.id=a.source_id
      WHERE e.parser_version IN (%s,'cbk-rates-v1') AND NOT e.needs_review AND s.enabled AND s.redistribution_allowed=true
        AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND s.config->>'investmentPublicationApproved'='true'
        AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
        AND NOT EXISTS(SELECT 1 FROM market.investment_observations o WHERE o.artifact_id=a.id AND o.parser_version=e.parser_version)
      ORDER BY e.id LIMIT %s""",(VERSION,limit))
    count=0
    for row in rows:
        async with database.transaction() as transaction:
            count+=await _publish_artifact(transaction,row)
    reports=await database.query("""WITH reviewed AS (
      SELECT DISTINCT ON(p.id) p.id,p.security_id,p.fiscal_year,p.period_type,p.period_end,p.reported_at,
        r.id AS review_id,c.scraped_artifact_id AS artifact_id,greatest(p.reported_at,a.retrieved_at::date) AS available_date
      FROM market.financial_periods p JOIN market.filing_history_reviews r ON r.period_id=p.id
      JOIN market.financial_statement_candidates c ON c.id=r.candidate_id
      JOIN scraping.raw_artifacts a ON a.id=c.scraped_artifact_id JOIN scraping.sources s ON s.id=a.source_id
      WHERE c.status='confirmed' AND p.reported_at<=CURRENT_DATE AND p.period_end<=CURRENT_DATE
        AND s.enabled AND s.redistribution_allowed=true AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
      ORDER BY p.id,r.reviewed_at DESC,r.id DESC
    ), pending AS (
      SELECT * FROM reviewed r WHERE NOT EXISTS(SELECT 1 FROM market.investment_observations o
        WHERE o.kind='event' AND o.natural_key='report:'||r.id AND o.artifact_id=r.artifact_id AND o.parser_version='filing-event-v1')
      ORDER BY reported_at DESC,id LIMIT %s
    ) INSERT INTO market.investment_observations(id,kind,natural_key,security_id,observed_date,available_date,artifact_id,payload,parser_version,verification,verified_at)
      SELECT 'filing-event:'||review_id,'event','report:'||id,security_id,reported_at,available_date,artifact_id,
       jsonb_build_object('periodId',id,'type','financial-report','title',split_part(security_id,':',2)||' '||fiscal_year||' '||period_type||' report',
        'status','published','terms',jsonb_build_object('periodEnd',period_end,'fiscalYear',fiscal_year)),
       'filing-event-v1','verified',now() FROM pending ON CONFLICT DO NOTHING RETURNING id""",(limit,))
    return dict(extractions=len(rows),observations=count,reportEvents=len(reports))


async def _publish_artifact(database,row):
    from .documents import encode
    count=0
    for table in row['tables']:
        if table.get('kind')!='investment_observations':continue
        for observation in table['observations']:
            # Persist true retrieval time; a later reparse cannot backdate a
            # revised vintage to the year being described.
            available=row['retrieved_at'].date().isoformat()
            identity=hashlib.sha256(encode([row['artifact_id'],observation['kind'],observation['naturalKey'],observation['date'],row['parser_version']]).encode()).hexdigest()
            inserted=await database.query("""INSERT INTO market.investment_observations
              (id,kind,natural_key,observed_date,available_date,artifact_id,payload,parser_version,verification,verified_at)
              VALUES(%s,%s,%s,%s,%s,%s,%s::jsonb,%s,'verified',now()) ON CONFLICT DO NOTHING RETURNING id""",
              (identity,observation['kind'],observation['naturalKey'],observation['date'],available,row['artifact_id'],encode(observation['payload']),row['parser_version']))
            count+=len(inserted)
    return count

