"""Finite automatic reconciliation over the live registry, never an issuer list.

Restartable receipts are in SQL; originals, extraction snapshots and prepared
payloads are private R2 objects. Explicit verified-original cleanup removes only
duplicates whose private copies and database references pass fresh checks.
"""
import argparse
import asyncio
import json
import os
import pathlib
import time
import uuid
from continua_scraper import transfer_budget
from continua_scraper.archive import R2Archive
from continua_scraper.config import validate_environment
from continua_scraper.database import Database
from continua_scraper.documents import encode
from continua_scraper.event_loop import database_event_loop
from continua_scraper.processed_archive import ProcessedArchive
from continua_scraper.research_processing import ResearchProcessor
from continua_scraper.storage import RawStorage
from scheduled_collect import limits,scheduled_slot


def reconciliation_limits(environment,migrate_raw):
    ceiling,daily,seconds,_=limits(environment)
    if migrate_raw:
        ceiling=int(environment.get('CLOUD_MIGRATION_RUN_TRANSFER_BYTES',str(384*1024**2)))
        daily=int(environment.get('CLOUD_MIGRATION_DAILY_TRANSFER_BYTES',str(1024**3)))
        if not 1<=ceiling<=384*1024**2 or not ceiling<=daily<=1024**3:
            raise ValueError('Invalid migration transfer allowance')
    return ceiling,daily,seconds


async def reconcile(*,migrate_raw=False,cleanup_verified=False,cleanup_only=False):
    if (cleanup_verified or cleanup_only) and not migrate_raw:raise ValueError('Legacy cleanup requires the migration allowance')
    validate_environment(os.environ)
    if os.environ.get('R2_DUAL_WRITE','false').lower() not in ('false','0','no',''):
        raise ValueError('Cloud reconciliation requires R2-only writes')
    ceiling,daily,seconds=reconciliation_limits(os.environ,migrate_raw)
    database=await Database.open(os.environ['DATABASE_URL'])
    storage=None;archive=None;cleanup=None
    budget=transfer_budget.TransferBudget(ceiling)
    receipt={'status':'running','mode':'automatic-full-registry','processed':0,
             'processedObjects':0,'archiveRecords':0,'failures':0,'destructive':cleanup_verified or cleanup_only,'originalsDeleted':0,'sourceBytesRemoved':0}
    run_id=('cloud-migration-' if migrate_raw else 'cloud-processed-')+os.environ.get('GITHUB_RUN_ID',uuid.uuid4().hex)+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    started=time.monotonic()
    try:
        # Additive checkpoint schema only. No SQL body is accepted from a job input.
        migration=pathlib.Path(__file__).resolve().parents[1]/'scraper/migrations/20261018120000 processed cloud archive.sql'
        async with database.pool.connection() as connection:
            await connection.execute(migration.read_text(encoding='utf-8'),prepare=False)
        async with scheduled_slot(database,run_id,'drain',ceiling,daily,migration=migrate_raw) as skipped:
            if skipped:return dict(receipt,status=skipped)
            transfer_budget.active=budget
            storage=RawStorage.from_environment()
            archive=R2Archive(database,storage.r2,storage.materialize,include_legacy=migrate_raw)
            if cleanup_verified or cleanup_only:
                from continua_scraper.legacy_cleanup import VerifiedLegacyCleanup
                cleanup=VerifiedLegacyCleanup(database,storage)
            if migrate_raw and not cleanup_only:
                from continua_scraper.documents import DocumentJobs
                receipt['recollectionJobsRequeued']=await DocumentJobs(database).recover_unarchived('kenyanstocks')
            processor=ResearchProcessor(database,processed_storage=storage.r2)
            payload_mode=os.environ.get('PROCESSED_PAYLOAD_MODE','database')
            if payload_mode not in ('database','r2'):raise ValueError('Invalid processed payload mode')
            exporter=ProcessedArchive(database,storage.r2,retire_payloads=payload_mode=='r2')
            # Reserve time for durable final receipts. A bounded batch may cross
            # the soft deadline; individual I/O and SQL already have deadlines.
            stop=started+max(1,seconds-90)
            try:
                processing=not cleanup_only;exporting=not cleanup_only;raw_pending=not cleanup_only
                cleanup_pending=cleanup is not None
                while time.monotonic()<stop and (processing or exporting or raw_pending or cleanup_pending):
                    if cleanup_pending:
                        result=await cleanup.run(5)
                        receipt['originalsDeleted']+=result['deleted'];receipt['sourceBytesRemoved']+=result['sourceBytesRemoved'];receipt['failures']+=result['failed']
                        if result.get('budgetPaused'):raise transfer_budget.TransferLimitReached()
                        cleanup_pending=result['deleted']>0
                    if processing:
                        result=await processor.run(25)
                        receipt['processed']+=result['processed'];receipt['failures']+=result['failed']
                        processing=result['processed']>0 or result['failed']>0
                    if exporting:
                        result=await exporter.run(25)
                        receipt['processedObjects']+=result['copied'];receipt['failures']+=result['failed']
                        exporting=result['copied']>0 or result['superseded']>0
                    if raw_pending:
                        result=await archive.run(5)
                        receipt['archiveRecords']+=result['copied'];receipt['failures']+=result['failed']
                        raw_pending=any(result.get(k,0) for k in ('copied','failed','superseded'))
                        # New R2 pointers can unblock previously gated evidence.
                        processing=processing or result['copied']>0
                        if cleanup and result['copied']>0:cleanup_pending=True
                    if processing:exporting=True
                receipt['status']='completed' if not(processing or exporting or raw_pending or cleanup_pending) else 'checkpointed'
            except transfer_budget.TransferLimitReached:receipt['status']='budget-paused'
            finally:
                receipt.update(budget.snapshot(),durationSeconds=round(time.monotonic()-started,3))
                if migrate_raw:
                    receipt['rawArchive']=await archive.inventory()
                    if receipt['status']=='completed' and any(receipt['rawArchive'].values()):receipt['status']='checkpointed'
                receipt['stockCoverage']=await processor.stock_coverage()
                await database.query("UPDATE scraping.scheduled_runs SET status=%s,completed_at=now(),receipt=%s::jsonb WHERE id=%s",
                    ('completed' if receipt['status'] in ('completed','checkpointed') else receipt['status'],encode(receipt),run_id))
    finally:
        if cleanup:await cleanup.close()
        if archive:await archive.close()
        transfer_budget.active=None
        if storage:storage.close()
        await database.close()
    return receipt


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--migrate-raw',action='store_true')
    parser.add_argument('--cleanup-verified-originals',action='store_true')
    parser.add_argument('--cleanup-only',action='store_true')
    args=parser.parse_args()
    if not args.apply:
        print(json.dumps({'submitted':False,'mode':'offline-plan','scope':'live NSE registry','migrateRaw':args.migrate_raw,'cleanupVerifiedOriginals':args.cleanup_verified_originals,'cleanupOnly':args.cleanup_only}));return 0
    try:
        result=asyncio.run(reconcile(migrate_raw=args.migrate_raw,cleanup_verified=args.cleanup_verified_originals,cleanup_only=args.cleanup_only),loop_factory=database_event_loop)
        print(json.dumps(result,allow_nan=False,separators=(',',':')))
        return 1 if result.get('failures',0) else 0
    except Exception as error:
        print(json.dumps({'status':'failed','errorClass':type(error).__name__,'reason':'Cloud reconciliation failed; private details omitted'}))
        return 1


if __name__=='__main__':raise SystemExit(main())
