"""Finite Actions runner; no Render calls, HTTP server or background scheduler."""
import argparse
import re
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

def pause_at_deadline(receipt):
    receipt['status']='failed' if any(s.get('failed',0) for s in receipt['sources']) else 'budget-paused'
    receipt['pauseReason']='run-time-budget'


def copy_partial_receipt(entry,error):
    for _ in range(3):
        partial=getattr(error,'collector_summary',None)
        if isinstance(partial,dict):
            entry.update({k:v for k,v in partial.items() if k in ('discovered','fetched','newArtifacts','extracted','needsReview','failed','skipped','errorClasses','visited','stored','notModified')})
            return
        error=getattr(error,'__cause__',None)
        if error is None:return


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

def source_reservation(source_id,ceiling):
    # Four bounded public JSON responses need no document-sized reservation.
    return min(ceiling,1024**2) if source_id=='worldbank-kenya-macro' else ceiling


def source_batch(environment,adapter):
    if adapter=='worldbank':return 4
    key,default=('COLLECTOR_PRIMARY_BATCH',12) if adapter=='kenyanstocks' else ('COLLECTOR_FALLBACK_BATCH',2)
    value=int(environment.get(key,str(default)))
    if not 1<=value<=100:raise ValueError('Invalid source batch configuration')
    return value

async def settle_completed_reservations(tx,*,migration=False):
    """Return measured unused allowance, not failed/crashed reservations.

    Called under the shared scheduler transaction lock. Retain a 1MiB buffer
    above already conservative transfer counters; append an idempotent receipt.
    Never reset a day, raise its allowance or refund incomplete work.
    """
    ledger='scraping.cloud_migration_transfer_days' if migration else 'scraping.scheduled_transfer_days'
    scope="id LIKE 'cloud-migration-%%'" if migration else "id NOT LIKE 'cloud-migration-%%'"
    rows=await tx.query(f"""SELECT id,receipt FROM scraping.scheduled_runs
      WHERE status='completed' AND started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        AND {scope}
        AND id NOT LIKE 'render-index-%%' AND NOT(receipt ? 'reservationSettlement')
        AND receipt ? 'limitBytes' AND receipt ? 'downloadBytes' AND receipt ? 'uploadBytes'
      ORDER BY started_at,id FOR UPDATE LIMIT 100""")
    settlements=[]
    for row in rows:
        receipt=row.get('receipt') or {}
        if not isinstance(receipt,dict):continue
        reserved,download,upload=(receipt.get(k) for k in ('limitBytes','downloadBytes','uploadBytes'))
        if any(type(n) is not int or n<0 for n in (reserved,download,upload)):continue
        if reserved>(384 if migration else 256)*1024**2 or reserved<1 or download+upload>reserved:continue
        retained=min(reserved,download+upload+1024**2)
        settlements.append((row['id'],{'originalReservedBytes':reserved,'retainedBytes':retained,'refundedBytes':reserved-retained}))
    refund=sum(s['refundedBytes'] for _,s in settlements)
    if not settlements:return
    balance=await tx.query(f"SELECT reserved_bytes FROM {ledger} WHERE day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE")
    if not balance or balance[0]['reserved_bytes']<refund:raise ValueError('Reservation audit does not match the daily ledger')
    await tx.query(f"UPDATE {ledger} SET reserved_bytes=reserved_bytes-%s WHERE day=(now() AT TIME ZONE 'UTC')::date",(refund,))
    for run_id,settlement in settlements:
        await tx.query("UPDATE scraping.scheduled_runs SET receipt=receipt || %s::jsonb WHERE id=%s",(encode({'reservationSettlement':settlement}),run_id))

@asynccontextmanager
async def scheduled_slot(database,run_id,kind,ceiling,daily,*,migration=False):
    """Transaction-pooler-safe atomic claim; never leave a session lock behind."""
    skipped=None
    async with database.transaction() as tx:
        acquired=await tx.query('SELECT pg_try_advisory_xact_lock(77123,15002) AS acquired')
        if not acquired[0]['acquired']:skipped='overlap-skipped'
        elif await tx.query('SELECT id FROM scraping.scheduled_runs WHERE id=%s',(run_id,)):skipped='duplicate-skipped'
        elif await tx.query("SELECT id FROM scraping.scheduled_runs WHERE status='running' AND id NOT LIKE 'render-index-%%' AND started_at>now()-interval '30 minutes' LIMIT 1"):
            skipped='overlap-skipped'
        else:
            await settle_completed_reservations(tx,migration=migration)
            ledger='scraping.cloud_migration_transfer_days' if migration else 'scraping.scheduled_transfer_days'
            reserved=await tx.query(f'''INSERT INTO {ledger}(day,reserved_bytes)
                VALUES((now() AT TIME ZONE 'UTC')::date,%s)
                ON CONFLICT(day) DO UPDATE SET reserved_bytes={ledger}.reserved_bytes+EXCLUDED.reserved_bytes
                WHERE {ledger}.reserved_bytes+EXCLUDED.reserved_bytes<=%s RETURNING day''',(ceiling,daily))
            if not reserved:skipped='budget-paused'
            else:await tx.query('INSERT INTO scraping.scheduled_runs(id,kind,status) VALUES(%s,%s,%s)',(run_id,kind,'running'))
    if skipped:
        yield skipped
        return
    try:yield None
    finally:
        # Exceptions/cancellation cannot leave a completed runner marked active.
        await database.query("UPDATE scraping.scheduled_runs SET status='failed',completed_at=now() WHERE id=%s AND status='running'",(run_id,))

async def run(kind,source_id=None,issuer=None,fresh=False,history_issuers=None):
    targets=list(dict.fromkeys((history_issuers or '').split(','))) if history_issuers else []
    if targets and (source_id!='kenyanstocks' or kind!='documents' or issuer or fresh or len(targets)>12 or any(not re.fullmatch('[A-Z0-9-]{1,20}',ticker) for ticker in targets)):
        raise ValueError('History refresh requires 1..12 exact registered issuer tickers and the KenyanStocks document source')
    if (issuer or fresh) and (source_id!='kenyanstocks' or kind!='documents' or not issuer):
        raise ValueError('Fresh issuer financials require the exact KenyanStocks document source')
    validate_environment(os.environ)
    if os.environ.get('R2_DUAL_WRITE','false').lower() not in ('false','0','no',''):
        raise ValueError('Scheduled collector forbids legacy duplicate uploads')
    ceiling,daily,seconds,source_limit=limits(os.environ)
    ceiling=source_reservation(source_id,ceiling)
    macro_only=source_id=='worldbank-kenya-macro'
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
                cloud_migration=migration.with_name('20261018120000 processed cloud archive.sql')
                await connection.execute(cloud_migration.read_text(encoding='utf-8'),prepare=False)
            from continua_scraper.research_processing import ResearchProcessor
            async with asyncio.timeout(60):
                receipt['processingBefore']=await ResearchProcessor(database).run(25)
                receipt['availableFinancialsBefore']=await ResearchProcessor(database).available_financials()
        async with scheduled_slot(database,run_id,kind,ceiling,daily) as skipped:
            if skipped:return dict(receipt,status=skipped,pauseReason='daily-reservation-limit' if skipped=='budget-paused' else skipped,reservationBytes=ceiling,durationSeconds=round(time.monotonic()-started,3))
            try:
                transfer_budget.active=budget
                storage=RawStorage.from_environment()
                runtime=CollectorRuntime(database,storage,scheduler_enabled=False)
                runtime.jobs.max_attempts=5
                if kind=='documents':
                    receipt['queueRecovery']={'requeuedMissingPrivateEvidence':await runtime.jobs.recover_unarchived('kenyanstocks')}
                try:
                    async with asyncio.timeout(seconds):
                        if process_research and not macro_only:
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
                                async with asyncio.timeout(240 if source['adapter']=='kenyanstocks' else 75):
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
                                        if targets:
                                            result={key:0 for key in ('discovered','fetched','newArtifacts','extracted','needsReview','failed','skipped')}
                                            for ticker in targets:
                                                part=await runtime.runner.run(adapter,batch_size=1,issuer=ticker,fresh=True,issuer_view='Historical Data')
                                                for key in result:result[key]+=part.get(key,0)
                                        else:
                                            result=await runtime.runner.run(adapter,drain_only=kind=='drain',batch_size=batch,issuer=issuer,fresh=fresh)
                                    entry.update({k:v for k,v in result.items() if k in ('discovered','fetched','newArtifacts','extracted','needsReview','failed','skipped','errorClasses','discoveryCoverage','targetCoverage','visited','stored','notModified')})
                            except asyncio.CancelledError as error:
                                copy_partial_receipt(entry,error)
                                raise
                            except TimeoutError as error:
                                copy_partial_receipt(entry,error)
                                entry['paused']=True
                                entry['pauseReason']='source-time-budget'
                            except transfer_budget.TransferLimitReached:
                                receipt['status']='budget-paused';break
                            except Exception:
                                entry['failed']=1
                            finally:
                                after=budget.snapshot()
                                entry.update(sourceId=source['id'],durationSeconds=round(time.monotonic()-source_started,3),
                                    **{key:after[key]-before[key] for key in ('downloadBytes','uploadBytes','retryCount')})
                        if budget.exhausted:receipt['status']='budget-paused'
                        if any(s.get('failed',0) for s in receipt['sources']):receipt['status']='failed'
                        if receipt['status']=='running':
                            receipt['status']='failed' if any(s.get('failed',0) for s in receipt['sources']) else 'budget-paused' if any(s.get('paused') for s in receipt['sources']) else 'completed'
                except TimeoutError:
                    # The enclosing asyncio.timeout is the approved finite run
                    # slice, not an unhandled provider failure. Completed work
                    # is already checkpointed; unfinished leases recover on the
                    # next scheduled run. Individual source timeouts still enter
                    # the per-source failure path above.
                    pause_at_deadline(receipt)
                except transfer_budget.TransferLimitReached:receipt['status']='budget-paused'
                finally:
                    if process_research:
                        try:
                            async with asyncio.timeout(120):
                                receipt['processingAfter']=await ResearchProcessor(database,processed_storage=storage.r2).run(100)
                                if os.environ.get('PROCESSED_PAYLOAD_MODE')=='r2' and not macro_only:
                                    from continua_scraper.processed_archive import ProcessedArchive
                                    receipt['processedCloudExport']=await ProcessedArchive(database,storage.r2,retire_payloads=True).run(25)
                                receipt['availableFinancials']=await ResearchProcessor(database).available_financials()
                                readiness=await database.query("SELECT to_regclass('market.investment_observations') IS NOT NULL AS ready")
                                if readiness and readiness[0]['ready']:
                                    from continua_scraper.investment import publish_investment_evidence
                                    receipt['investmentEvidence']=await publish_investment_evidence(database)
                                graph_ready=await database.query("SELECT to_regclass('market.exposure_relationships') IS NOT NULL AS ready")
                                if graph_ready and graph_ready[0]['ready']:
                                    from continua_scraper.relationships import store_relationship_drafts
                                    receipt['relationshipDrafts']=await store_relationship_drafts(database)
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
        if operation=='prepare-institutional':
            path=pathlib.Path(__file__).resolve().parents[1]/'supabase/migrations/20261022010000_institutional_governance.sql'
            async with database.pool.connection() as connection:
                async with connection.transaction():
                    await connection.execute(path.read_text(encoding='utf-8'),prepare=False)
            from continua_scraper.relationships import store_relationship_drafts
            drafts=await store_relationship_drafts(database)
            return {'status':'completed','operation':operation,'destructive':False,'relationships':drafts}
        if operation=='prepare-investment':
            # Explicit maintenance invocation only; no migration during API boot.
            path=pathlib.Path(__file__).resolve().parents[1]/'supabase/migrations/20261021150000_investment_evidence.sql'
            async with database.pool.connection() as connection:
                async with connection.transaction():
                    await connection.execute(path.read_text(encoding='utf-8'),prepare=False)
                    history_identity=path.with_name('20261021200000_investment_history_identity.sql')
                    await connection.execute(history_identity.read_text(encoding='utf-8'),prepare=False)
            from continua_scraper.sources import Sources
            defaults=json.loads((pathlib.Path(__file__).parent/'continua_scraper/default_sources.json').read_text(encoding='utf-8'))
            selected=[s for s in defaults if s['id'] in ('worldbank-kenya-macro','cbk-macro-history','cbk-policy-history','knbs-economic-releases')]
            for source in selected:await Sources(database).save(source,only_if_missing=True)
            from continua_scraper.investment import publish_investment_evidence
            published=await publish_investment_evidence(database)
            return {'status':'completed','operation':operation,'registered':len(selected),'existingDisablesPreserved':True,'destructive':False,'investmentEvidence':published}
        if operation=='process-research':
            path=pathlib.Path(__file__).resolve().parents[1]/'scraper/migrations/20261016170000 processed research.sql'
            async with database.pool.connection() as connection:
                await connection.execute(path.read_text(encoding='utf-8'),prepare=False)
            from continua_scraper.research_processing import ResearchProcessor
            async with asyncio.timeout(120):
                from continua_scraper.documents import DocumentJobs
                recovered=await DocumentJobs(database).recover_unarchived('kenyanstocks')
                summary=await ResearchProcessor(database).run(100)
                inventory=await ResearchProcessor(database).inventory()
                available=await ResearchProcessor(database).available_financials()
                coverage=await ResearchProcessor(database).stock_coverage()
            sources=await database.query("""SELECT id,adapter,enabled,redistribution_allowed,
              length(trim(coalesce(config->>'permissionReference',''))) BETWEEN 1 AND 200 AS permission_recorded
              FROM scraping.sources ORDER BY id""")
            return {'status':'completed','operation':operation,'processing':summary,'kenyanstocksInventory':inventory,
                    'availableFinancials':available,'stockCoverage':coverage,'queueRecovery':{'requeuedMissingPrivateEvidence':recovered},'sourceConfiguration':sources,'sourceDownloadBytes':0,'r2DownloadBytes':0}
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
    parser.add_argument('--history-issuers')
    parser.add_argument('--fresh',action='store_true')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--maintenance',choices=('prepare','verify-storage','process-research','prepare-investment','prepare-institutional'))
    args=parser.parse_args()
    if not args.apply:
        print(json.dumps({'mode':'offline-plan','kind':args.kind,'submitted':False}));return 0
    try:
        operation=maintenance(args.maintenance) if args.maintenance else run(args.kind,args.source,args.issuer,args.fresh,args.history_issuers)
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
