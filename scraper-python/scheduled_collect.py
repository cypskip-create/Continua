"""Finite Actions runner; no Render calls, HTTP server or background scheduler."""
import argparse
import asyncio
import json
import os
import time
import uuid
import pathlib
import tempfile
import hashlib
from contextlib import asynccontextmanager
from continua_scraper.download import Artifact
from continua_scraper import transfer_budget
from continua_scraper.config import validate_environment
from continua_scraper.database import Database
from continua_scraper.documents import encode
from continua_scraper.event_loop import database_event_loop
from continua_scraper.runtime import CollectorRuntime
from continua_scraper.storage import RawStorage
from continua_scraper.crawler import GenericCrawler

def limits(environment):
    result=[]
    for key,default,maximum in (
        ('COLLECTOR_RUN_TRANSFER_BYTES',32*1024**2,256*1024**2),
        ('COLLECTOR_DAILY_TRANSFER_BYTES',128*1024**2,1024**3),
        ('COLLECTOR_RUN_SECONDS',600,1200),
        ('COLLECTOR_SOURCE_LIMIT',5,20)):
        value=int(environment.get(key,str(default)))
        if not 1<=value<=maximum:raise ValueError('Invalid scheduled collector limit')
        result.append(value)
    if result[0]>result[1]:raise ValueError('Run reservation exceeds daily limit')
    return result

def ordered_sources(sources,kind,hour):
    """KenyanStocks is primary for document discovery, with rotating fallbacks."""
    offset=hour%max(1,len(sources))
    rotated=sources[offset:]+sources[:offset]
    return sorted(rotated,key=lambda s:0 if kind!='news' and s['adapter']=='kenyanstocks' else 1)

def source_batch(environment,adapter):
    key,default=('COLLECTOR_PRIMARY_BATCH',12) if adapter=='kenyanstocks' else ('COLLECTOR_FALLBACK_BATCH',2)
    value=int(environment.get(key,str(default)))
    if not 1<=value<=100:raise ValueError('Invalid source batch configuration')
    return value

async def settle_completed_reservations(tx):
    """Return measured unused allowance, not failed/crashed reservations.

    Called under the shared scheduler transaction lock. Retain a 1MiB buffer
    above already conservative transfer counters; append an idempotent receipt.
    Never reset a day, raise its allowance or refund incomplete work.
    """
    rows=await tx.query("""SELECT id,receipt FROM scraping.scheduled_runs
      WHERE status='completed' AND started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        AND id NOT LIKE 'render-index-%%' AND NOT(receipt ? 'reservationSettlement')
        AND receipt ? 'limitBytes' AND receipt ? 'downloadBytes' AND receipt ? 'uploadBytes'
      ORDER BY started_at,id FOR UPDATE LIMIT 100""")
    settlements=[]
    for row in rows:
        receipt=row.get('receipt') or {}
        if not isinstance(receipt,dict):continue
        reserved,download,upload=(receipt.get(k) for k in ('limitBytes','downloadBytes','uploadBytes'))
        if any(type(n) is not int or n<0 for n in (reserved,download,upload)):continue
        if reserved>256*1024**2 or reserved<1 or download+upload>reserved:continue
        retained=min(reserved,download+upload+1024**2)
        settlements.append((row['id'],{'originalReservedBytes':reserved,'retainedBytes':retained,'refundedBytes':reserved-retained}))
    refund=sum(s['refundedBytes'] for _,s in settlements)
    if not settlements:return
    balance=await tx.query("SELECT reserved_bytes FROM scraping.scheduled_transfer_days WHERE day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE")
    if not balance or balance[0]['reserved_bytes']<refund:raise ValueError('Reservation audit does not match the daily ledger')
    await tx.query("UPDATE scraping.scheduled_transfer_days SET reserved_bytes=reserved_bytes-%s WHERE day=(now() AT TIME ZONE 'UTC')::date",(refund,))
    for run_id,settlement in settlements:
        await tx.query("UPDATE scraping.scheduled_runs SET receipt=receipt || %s::jsonb WHERE id=%s",(encode({'reservationSettlement':settlement}),run_id))

@asynccontextmanager
async def scheduled_slot(database,run_id,kind,ceiling,daily):
    """Transaction-pooler-safe atomic claim; never leave a session lock behind."""
    skipped=None
    async with database.transaction() as tx:
        acquired=await tx.query('SELECT pg_try_advisory_xact_lock(77123,15002) AS acquired')
        if not acquired[0]['acquired']:skipped='overlap-skipped'
        elif await tx.query('SELECT id FROM scraping.scheduled_runs WHERE id=%s',(run_id,)):skipped='duplicate-skipped'
        elif await tx.query("SELECT id FROM scraping.scheduled_runs WHERE status='running' AND id NOT LIKE 'render-index-%%' AND started_at>now()-interval '30 minutes' LIMIT 1"):
            skipped='overlap-skipped'
        else:
            await settle_completed_reservations(tx)
            reserved=await tx.query('''INSERT INTO scraping.scheduled_transfer_days(day,reserved_bytes)
                VALUES((now() AT TIME ZONE 'UTC')::date,%s)
                ON CONFLICT(day) DO UPDATE SET reserved_bytes=scraping.scheduled_transfer_days.reserved_bytes+EXCLUDED.reserved_bytes
                WHERE scraping.scheduled_transfer_days.reserved_bytes+EXCLUDED.reserved_bytes<=%s RETURNING day''',(ceiling,daily))
            if not reserved:skipped='budget-paused'
            else:await tx.query('INSERT INTO scraping.scheduled_runs(id,kind,status) VALUES(%s,%s,%s)',(run_id,kind,'running'))
    if skipped:
        yield skipped
        return
    try:yield None
    finally:
        # Exceptions/cancellation cannot leave a completed runner marked active.
        await database.query("UPDATE scraping.scheduled_runs SET status='failed',completed_at=now() WHERE id=%s AND status='running'",(run_id,))

async def run(kind,source_id=None,issuer=None,fresh=False):
    if (issuer or fresh) and (source_id!='kenyanstocks' or kind!='documents' or not issuer):
        raise ValueError('Fresh issuer financials require the exact KenyanStocks document source')
    validate_environment(os.environ)
    if os.environ.get('R2_DUAL_WRITE','false').lower() not in ('false','0','no',''):
        raise ValueError('Scheduled collector forbids legacy duplicate uploads')
    ceiling,daily,seconds,source_limit=limits(os.environ)
    database=await Database.open(os.environ['DATABASE_URL'])
    runtime=None
    budget=transfer_budget.TransferBudget(ceiling)
    receipt={'kind':kind,'sources':[],'status':'running','scope':'logical source/browser transfers; R2 upload retry reservations; excludes DB/TLS/SDK headers, not a billing cap'}
    run_id=os.environ.get('GITHUB_RUN_ID','local-'+uuid.uuid4().hex)+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    started=time.monotonic()
    try:
        process_research=os.environ.get('COLLECTOR_PROCESS_RESEARCH')=='true'
        if process_research:
            # Explicit Actions deployment path, not a public API/Render boot
            # migration. The additive, RLS-protected receipt table is reviewed
            # in source control and contains no raw document bodies.
            migration=pathlib.Path(__file__).resolve().parents[1]/'scraper/migrations/20261016170000 processed research.sql'
            async with database.pool.connection() as connection:
                await connection.execute(migration.read_text(encoding='utf-8'),prepare=False)
            from continua_scraper.research_processing import ResearchProcessor
            async with asyncio.timeout(60):
                receipt['processingBefore']=await ResearchProcessor(database).run(25)
                receipt['availableFinancialsBefore']=await ResearchProcessor(database).available_financials()
        async with scheduled_slot(database,run_id,kind,ceiling,daily) as skipped:
            if skipped:return dict(receipt,status=skipped)
            try:
                transfer_budget.active=budget
                storage=RawStorage.from_environment()
                runtime=CollectorRuntime(database,storage,scheduler_enabled=False)
                runtime.jobs.max_attempts=5
                try:
                    async with asyncio.timeout(seconds):
                        if process_research:
                            from continua_scraper.research_processing import reparse_archived_views
                            receipt['archiveReprocessing']=await reparse_archived_views(runtime,2)
                        sources=await runtime.sources.enabled()
                        # Disjoint ownership: the resumed Render light service
                        # owns this HTML-only summary, never Actions documents.
                        sources=[s for s in sources if s['id']!='nse-index-summary']
                        sources=[s for s in sources if (s['adapter']=='rss')==(kind=='news')]
                        if source_id:sources=[s for s in sources if s['id']==source_id]
                        if source_id and not sources:raise ValueError('Source disabled or incompatible with selected batch')
                        # Fair rotation across runs; no source list or URL enters logs.
                        sources=ordered_sources(sources,kind,int(time.time()//3600))[:source_limit]
                        for source in sources:
                            if budget.exhausted:break
                            if sum(budget.snapshot()[k] for k in ('uploadBytes','downloadBytes'))>=ceiling:break
                            before=budget.snapshot();source_started=time.monotonic()
                            entry={};receipt['sources'].append(entry)
                            try:
                                adapter=await runtime.registry.build(source['id'])
                                if isinstance(adapter,GenericCrawler):
                                    if kind=='drain':raise ValueError('Generic crawler has separate crawl checkpoints')
                                    result=await adapter.run(2)
                                else:
                                    # Queue RSS and other lightweight discoveries too:
                                    # a two-document batch must not silently drop
                                    # the remainder or repeatedly select only the
                                    # newest two feed entries on fresh runners.
                                    batch=source_batch(os.environ,source['adapter'])
                                    if os.environ.get('COLLECTOR_VERIFY_ONE')=='true':batch=1
                                    adapter.persistent_batch_size=batch
                                    result=await runtime.runner.run(adapter,drain_only=kind=='drain',batch_size=batch,issuer=issuer,fresh=fresh)
                                entry.update({k:v for k,v in result.items() if k in ('discovered','fetched','newArtifacts','extracted','needsReview','failed','skipped','errorClasses','discoveryCoverage','targetCoverage')})
                            except transfer_budget.TransferLimitReached:
                                receipt['status']='budget-paused';break
                            except Exception:
                                entry['failed']=1
                            finally:
                                after=budget.snapshot()
                                entry.update(sourceId=source['id'],durationSeconds=round(time.monotonic()-source_started,3),
                                    **{key:after[key]-before[key] for key in ('downloadBytes','uploadBytes','retryCount')})
                        if budget.exhausted:receipt['status']='budget-paused'
                        if receipt['status']=='running':
                            receipt['status']='failed' if any(s.get('failed',0) for s in receipt['sources']) else 'completed'
                except TimeoutError:receipt['status']='failed'
                except transfer_budget.TransferLimitReached:receipt['status']='budget-paused'
                finally:
                    if process_research:
                        try:
                            async with asyncio.timeout(120):
                                receipt['processingAfter']=await ResearchProcessor(database).run(100)
                                receipt['availableFinancials']=await ResearchProcessor(database).available_financials()
                        except Exception:
                            receipt['processingAfter']={'status':'failed','retryable':True}
                            receipt['status']='failed'
                    receipt.update(budget.snapshot(),durationSeconds=round(time.monotonic()-started,3))
                    await database.query('UPDATE scraping.scheduled_runs SET status=%s,completed_at=now(),receipt=%s::jsonb WHERE id=%s',(receipt['status'],encode(receipt),run_id))
            finally:transfer_budget.active=None
    finally:
        transfer_budget.active=None
        if runtime:await runtime.close()
        else:await database.close()
    return receipt

async def maintenance(operation):
    """Explicit bounded deployment checks; no issuer fetches or historical crawl."""
    validate_environment(os.environ)
    database=await Database.open(os.environ['DATABASE_URL'])
    storage=None
    try:
        if operation=='process-research':
            path=pathlib.Path(__file__).resolve().parents[1]/'scraper/migrations/20261016170000 processed research.sql'
            async with database.pool.connection() as connection:
                await connection.execute(path.read_text(encoding='utf-8'),prepare=False)
            from continua_scraper.research_processing import ResearchProcessor
            async with asyncio.timeout(120):
                summary=await ResearchProcessor(database).run(100)
                inventory=await ResearchProcessor(database).inventory()
                available=await ResearchProcessor(database).available_financials()
                coverage=await ResearchProcessor(database).stock_coverage()
            sources=await database.query("""SELECT id,adapter,enabled,redistribution_allowed,
              length(trim(coalesce(config->>'permissionReference',''))) BETWEEN 1 AND 200 AS permission_recorded
              FROM scraping.sources ORDER BY id""")
            return {'status':'completed','operation':operation,'processing':summary,'kenyanstocksInventory':inventory,
                    'availableFinancials':available,'stockCoverage':coverage,'sourceConfiguration':sources,'sourceDownloadBytes':0,'r2DownloadBytes':0}
        if operation=='prepare':
            path=pathlib.Path(__file__).resolve().parents[1]/'scraper/migrations/20261015190000 scheduled collector budgets.sql'
            async with database.pool.connection() as connection:
                await connection.execute(path.read_text(encoding='utf-8'),prepare=False)
            return {'status':'completed','operation':'prepare','destructive':False}
        storage=RawStorage.from_environment()
        # One tiny synthetic private object is deliberately retained for audit.
        data=('Continua scheduled storage verification '+uuid.uuid4().hex).encode()
        digest=hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory(prefix='continua-storage-smoke-') as directory:
            path=pathlib.Path(directory)/'receipt.txt';path.write_bytes(data)
            artifact=Artifact(path,'https://fixture.invalid/never-fetched','text/plain',len(data),digest)
            location=await asyncio.to_thread(storage.store,'scheduled-smoke',artifact)
            def verify():
                with storage.materialize(location) as saved:
                    if saved.sha256!=digest or saved.size!=len(data):raise ValueError('Storage verification failed')
            await asyncio.to_thread(verify)
        receipt={'status':'completed','operation':'verify-storage','objectBytes':len(data),'r2RoundTripVerified':True}
        await database.query('INSERT INTO scraping.scheduled_runs(id,kind,status,completed_at,receipt) VALUES(%s,%s,%s,now(),%s::jsonb)',('smoke-'+uuid.uuid4().hex,'drain','completed',encode(receipt)))
        return dict(receipt,databaseWriteVerified=True)
    finally:
        if storage:storage.close()
        await database.close()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--kind',choices=('news','documents','drain'),default='documents')
    parser.add_argument('--source')
    parser.add_argument('--issuer')
    parser.add_argument('--fresh',action='store_true')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--maintenance',choices=('prepare','verify-storage','process-research'))
    args=parser.parse_args()
    if not args.apply:
        print(json.dumps({'mode':'offline-plan','kind':args.kind,'submitted':False}));return 0
    try:
        operation=maintenance(args.maintenance) if args.maintenance else run(args.kind,args.source,args.issuer,args.fresh)
        result=asyncio.run(operation,loop_factory=database_event_loop)
        print(json.dumps(result,allow_nan=False,separators=(',',':')))
        return 1 if result['status']=='failed' else 0
    except Exception as error:
        # Never print SDK exception strings: they may contain URLs or secrets.
        status=getattr(error,'response',{}).get('ResponseMetadata',{}).get('HTTPStatusCode')
        code=getattr(error,'response',{}).get('Error',{}).get('Code')
        operation=getattr(error,'operation_name',None)
        print(json.dumps({'status':'failed','reason':'Scheduled collector failed; private credentials and source details omitted',
            'errorClass':type(error).__name__,'providerHTTPStatus':status if type(status) is int else None,
            'providerOperation':operation if operation in ('HeadObject','PutObject','GetObject') else None,
            'providerCode':code if code in ('400','403','404','AccessDenied','InvalidAccessKeyId','SignatureDoesNotMatch','InvalidArgument','InvalidRequest','AuthorizationHeaderMalformed','NoSuchBucket','NotImplemented') else 'unclassified'}))
        return 1

if __name__=='__main__':raise SystemExit(main())
