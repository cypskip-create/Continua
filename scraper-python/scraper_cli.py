"""Native scraper CLI. Offline plans by default; never shadows operator."""
import argparse
import asyncio
import hashlib
import json
import os
import pathlib
import re
import sys
from continua_scraper.database import Database
from continua_scraper.storage import RawStorage
from continua_scraper.runtime import CollectorRuntime
from continua_scraper.registry import REGISTERED
from continua_scraper.source_operations import record_permission,disable_news_source,enable_licensed_nse
from continua_scraper.inspection import extraction as inspect_extraction,archive_layouts

def source_records(path):
    path=pathlib.Path(path)
    if not path.is_file() or path.stat().st_size>2*1024*1024:raise ValueError('Bounded source definition file required')
    raw=path.read_bytes()
    data=json.loads(raw,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite source configuration')))
    records=data if isinstance(data,list) else [data]
    if not 1<=len(records)<=1000:raise ValueError('Source definition budget')
    for source in records:
        if not isinstance(source,dict) or not isinstance(source.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,200}',source['id']):raise ValueError('Explicit source identifier required')
        if not isinstance(source.get('name'),str) or not 1<=len(source['name'])<=400 or source.get('adapter') not in REGISTERED|{'web','generic'}:raise ValueError('Source name/adapter unavailable')
        if type(source.get('enabled')) is not bool or not isinstance(source.get('config'),dict):raise ValueError('Explicit source enable/configuration fields required')
        if source.get('redistributionAllowed') is not None and type(source['redistributionAllowed']) is not bool:raise ValueError('Invalid source permission')
        if source.get('attributionRequired') is not None and type(source['attributionRequired']) is not bool:raise ValueError('Invalid source attribution policy')
        source.setdefault('redistributionAllowed',None);source.setdefault('attributionRequired',None)
        config=source['config']
        if source['enabled'] and (source['adapter']=='mystocks' or config.get('requiresCommercialPermission') is True):
            if not isinstance(config.get('permissionReference'),str) or not 1<=len(config['permissionReference'].strip())<=200:raise ValueError('Recorded source permission is required before enabling collection')
    return records,hashlib.sha256(raw).hexdigest()

def arguments(argv):
    parser=argparse.ArgumentParser(description='Native Continua private scraper operator')
    parser.add_argument('--operation',required=True,choices=('seed-defaults','register-source','record-permission','enable-licensed-nse','disable-news-source','inspect-extraction','inspect-archive-layouts','backfill-history','backfill-kenyanstocks','collect-source','discover','enqueue','reprocess','sweep','archive','recover-artifact'))
    parser.add_argument('--permission-reference')
    parser.add_argument('--allowed-usage')
    parser.add_argument('--scope-confirmed',action='store_true')
    parser.add_argument('--retry-failed-seed',action='store_true')
    parser.add_argument('--source')
    parser.add_argument('--input')
    parser.add_argument('--url')
    parser.add_argument('--title')
    parser.add_argument('--artifact',type=int)
    parser.add_argument('--extraction',type=int)
    parser.add_argument('--include-source-text',action='store_true')
    parser.add_argument('--batch-size',type=int,default=10)
    parser.add_argument('--batches',type=int,default=1)
    parser.add_argument('--drain-only',action='store_true')
    parser.add_argument('--replace-existing',action='store_true')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args(argv)
    if not 1<=args.batch_size<=100 or not 1<=args.batches<=100:raise ValueError('Batches and batch size must be 1..100')
    if args.source is not None and not re.fullmatch(r'[A-Za-z0-9._-]{1,200}',args.source):raise ValueError('Invalid source identifier')
    if args.operation in ('register-source',) and not args.input:raise ValueError('Explicit source JSON input required')
    if args.operation in ('inspect-archive-layouts','record-permission','disable-news-source','backfill-history','backfill-kenyanstocks','collect-source','discover','enqueue') and not args.source:raise ValueError('Explicit source identifier required')
    if args.operation=='inspect-extraction' and (args.extraction is None or not 1<=args.extraction<=9007199254740991):raise ValueError('Explicit extraction identifier required')
    if args.include_source_text and args.operation!='inspect-extraction':raise ValueError('Source text is available only for an explicit extraction inspection')
    if args.operation=='record-permission' and (not args.permission_reference or not args.allowed_usage):raise ValueError('Permission reference and explicit allowed usage required')
    if args.operation=='enable-licensed-nse' and (not args.permission_reference or not args.scope_confirmed):raise ValueError('Explicit NSE permission reference and scope confirmation required')
    if args.retry_failed_seed and (args.operation!='collect-source' or not args.url):raise ValueError('Seed retry requires collect-source and one exact approved URL')
    if args.operation=='enqueue' and not args.url:raise ValueError('Explicit approved-source URL required')
    if args.operation in ('reprocess','recover-artifact') and (args.artifact is None or not 1<=args.artifact<=9007199254740991):raise ValueError('Explicit artifact identifier required')
    return args

async def execute(args):
    records=None;digest=None
    if args.operation in ('seed-defaults','register-source'):
        file=args.input or pathlib.Path(__file__).parent/'continua_scraper'/'default_sources.json'
        records,digest=source_records(file)
    if not args.apply and args.operation not in ('inspect-extraction','inspect-archive-layouts'):
        return {'mode':'offline-plan','operation':args.operation,'sourceId':args.source,'artifactId':args.artifact,'batches':args.batches,'batchSize':args.batch_size,'sourceCount':len(records) if records is not None else None,'inputSha256':digest,'submitted':False}
    database=await Database.open(os.environ['DATABASE_URL'])
    if args.operation in ('inspect-extraction','inspect-archive-layouts'):
        try:
            if args.operation=='inspect-extraction':return await inspect_extraction(database,args.extraction,args.include_source_text)
            return await archive_layouts(database,args.source)
        finally:await database.close()
    if args.operation in ('record-permission','disable-news-source','enable-licensed-nse'):
        try:
            if args.operation=='enable-licensed-nse':return await enable_licensed_nse(database,args.permission_reference,args.scope_confirmed)
            if args.operation=='record-permission':return await record_permission(database,args.source,args.permission_reference,args.allowed_usage)
            return await disable_news_source(database,args.source)
        finally:await database.close()
    try:storage=RawStorage.from_environment()
    except BaseException:await database.close();raise
    runtime=CollectorRuntime(database,storage,scheduler_enabled=False)
    try:
        if records is not None:
            for source in records:await runtime.sources.save(source,only_if_missing=not args.replace_existing)
            return {'operation':args.operation,'sourceCount':len(records),'existingDisablesPreserved':not args.replace_existing}
        if args.operation=='reprocess':return await runtime.extraction.reprocess(args.artifact)
        if args.operation=='sweep':return await runtime.extraction.sweep(args.batch_size)
        if args.operation=='archive':
            if args.batch_size>20:raise ValueError('Archive batch maximum is twenty')
            return await runtime.archive.run(args.batch_size)
        if args.operation=='recover-artifact':
            record=await runtime.evidence.artifact_by_id(args.artifact)
            if not record:raise ValueError('Artifact not found')
            adapter=await runtime.registry.build(record['sourceId'])
            artifact=await adapter.io.downloader.fetch(record['documentUrl'])
            try:
                if artifact.sha256!=record['sha256']:raise ValueError('Source changed; original artifact is not restored')
                saved=await adapter.io.persist({'url':record['documentUrl'],'title':record.get('title')},artifact,record['adapter'],record.get('crawlerVersion') or 'native-recovery-v1')
                return {'artifactId':saved['artifactId'],'sha256':artifact.sha256,'restored':True}
            finally:artifact.path.unlink(missing_ok=True)
        adapter=await runtime.registry.build(args.source)
        if args.retry_failed_seed:
            adapter.io.downloader.policy.check_url(args.url)
            if args.url not in ((adapter.io.source.get('config') or {}).get('seeds') or []):raise ValueError('Retry target must be an exact registered seed')
            await database.query("UPDATE scraping.crawl_state SET status='discovered' WHERE source_id=%s AND url=%s AND status='failed'",(args.source,args.url))
        if args.operation=='backfill-history' and adapter.io.source['adapter']!='nse':raise ValueError('Historical NSE backfill requires an NSE source')
        if args.operation=='backfill-kenyanstocks' and adapter.io.source['adapter']!='kenyanstocks':raise ValueError('KenyanStocks backfill requires its own source')
        if args.operation=='enqueue':
            adapter.io.downloader.policy.check_url(args.url)
            await runtime.jobs.enqueue(args.source,[{'url':args.url,'title':args.title,'discoveredFrom':args.url}])
            return {'sourceId':args.source,'queued':1}
        if args.operation=='discover':
            documents=await adapter.discover()
            await runtime.jobs.enqueue(args.source,documents)
            return {'sourceId':args.source,'discovered':len(documents)}
        summaries=[]
        for index in range(args.batches):
            durable=getattr(adapter,'persistent_batch_size',None) is not None
            summary=await runtime.registry.run(args.source,drain_only=args.drain_only or (index>0 and durable),batch_size=args.batch_size)
            summaries.append(summary)
            if summary.get('fetched')==0 and summary.get('failed')==0:break
        return {'sourceId':args.source,'batches':summaries}
    finally:await runtime.close()

def main(argv=None):
    try:
        from continua_scraper.event_loop import database_event_loop
        result=asyncio.run(execute(arguments(sys.argv[1:] if argv is None else argv)),loop_factory=database_event_loop)
        print(json.dumps(result,ensure_ascii=False,allow_nan=False,default=str,separators=(',',':')))
        return 0
    except KeyboardInterrupt:return 130
    except Exception:
        print(json.dumps({'error':'native_scraper_operation_failed'}),file=sys.stderr)
        return 1

if __name__=='__main__':raise SystemExit(main())
