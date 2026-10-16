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

async def run(kind,source_id=None):
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
        # Session-pooler/direct PostgreSQL only. Keep the lock's connection
        # checked out until all jobs finish, including cancellation cleanup.
        async with database.pool.connection() as lock:
            cursor=await lock.execute('SELECT pg_try_advisory_lock(77123,15001) AS acquired')
            if not (await cursor.fetchone())['acquired']:
                return dict(receipt,status='overlap-skipped')
            try:
                async with database.transaction() as tx:
                    duplicate=await tx.query('SELECT id FROM scraping.scheduled_runs WHERE id=%s',(run_id,))
                    if duplicate:return dict(receipt,status='duplicate-skipped')
                    reserved=await tx.query('''INSERT INTO scraping.scheduled_transfer_days(day,reserved_bytes)
                        VALUES((now() AT TIME ZONE 'UTC')::date,%s)
                        ON CONFLICT(day) DO UPDATE SET reserved_bytes=scraping.scheduled_transfer_days.reserved_bytes+EXCLUDED.reserved_bytes
                        WHERE scraping.scheduled_transfer_days.reserved_bytes+EXCLUDED.reserved_bytes<=%s RETURNING day''',(ceiling,daily))
                    if not reserved:return dict(receipt,status='budget-paused')
                    await tx.query('INSERT INTO scraping.scheduled_runs(id,kind,status) VALUES(%s,%s,%s)',(run_id,kind,'running'))
                transfer_budget.active=budget
                storage=RawStorage.from_environment()
                runtime=CollectorRuntime(database,storage,scheduler_enabled=False)
                runtime.jobs.max_attempts=5
                try:
                    async with asyncio.timeout(seconds):
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
                                    batch=12 if source['adapter']=='kenyanstocks' else 2
                                    adapter.persistent_batch_size=batch
                                    result=await runtime.runner.run(adapter,drain_only=kind=='drain',batch_size=batch)
                                entry.update({k:v for k,v in result.items() if k in ('discovered','fetched','newArtifacts','extracted','needsReview','failed','skipped','errorClasses','discoveryCoverage')})
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
                finally:
                    receipt.update(budget.snapshot(),durationSeconds=round(time.monotonic()-started,3))
                    await database.query('UPDATE scraping.scheduled_runs SET status=%s,completed_at=now(),receipt=%s::jsonb WHERE id=%s',(receipt['status'],encode(receipt),run_id))
            finally:await lock.execute('SELECT pg_advisory_unlock(77123,15001)')
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
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--maintenance',choices=('prepare','verify-storage'))
    args=parser.parse_args()
    if not args.apply:
        print(json.dumps({'mode':'offline-plan','kind':args.kind,'submitted':False}));return 0
    try:
        operation=maintenance(args.maintenance) if args.maintenance else run(args.kind,args.source)
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
