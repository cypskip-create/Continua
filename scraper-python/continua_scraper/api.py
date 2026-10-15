"""Native collector operator API. All routes are local candidates until release."""
import hashlib
import hmac
import json
import time
import asyncio
from .archive import snapshot_json
from .diagnostics import health,crawl_status,timestamp
from .crawler import GenericCrawler
from .rss import RssAdapter

def valid_operator_key(provided,configured):
    if not isinstance(configured,str) or len(configured)<32 or not isinstance(provided,str) or not provided or len(provided.encode('utf-16-le',errors='replace'))//2>512:return False
    return hmac.compare_digest(hashlib.sha256(provided.encode()).digest(),hashlib.sha256(configured.encode()).digest())

def public_route(method,path):
    return (method=='GET' and path in ('/health','/health/live','/news/status')) or (method=='POST' and path in ('/indices/refresh','/news/refresh','/documents/refresh'))

def create_server(runtime,*,operator_key='',market_key='',release_ready=False,revision=None):
    from aiohttp import web
    counters={}
    def response(data,status=200):return web.Response(body=snapshot_json(data),status=status,content_type='application/json')
    @web.middleware
    async def guard(request,handler):
        market_route=request.path=='/internal/nse/read'
        permitted=valid_operator_key(request.headers.get('X-Collector-Market-Key'),market_key) if market_route else (public_route(request.method,request.path) or valid_operator_key(request.headers.get('X-Scraper-Admin-Key'),operator_key))
        if not permitted:
            result=response({'error':'operator_authentication_required'},401)
        else:
            now=time.monotonic();identity=request.remote or 'unknown';entry=counters.get(identity)
            if entry is None or now-entry[0]>=60:
                if identity not in counters and len(counters)>=10000:result=response({'error':'request_capacity_exceeded'},429)
                else:counters[identity]=[now,1];result=None
            elif entry[1]>=120:result=response({'error':'rate_limit_exceeded'},429)
            else:entry[1]+=1;result=None
            if result is None:
                try:result=await handler(request)
                except web.HTTPRequestEntityTooLarge:result=response({'error':'request_too_large'},413)
                except (ValueError,TypeError,json.JSONDecodeError):result=response({'error':'invalid_request'},400)
                except web.HTTPException as error:result=response({'error':'not_found','path':request.path},error.status)
                except Exception:result=response({'error':'collector_operation_unavailable'},503)
        result.headers['Cache-Control']='no-store';result.headers['X-Content-Type-Options']='nosniff'
        return result
    app=web.Application(client_max_size=65536,middlewares=[guard])
    async def body(request):
        data=await request.json() if request.can_read_body else {}
        if not isinstance(data,dict):raise ValueError('Invalid request body')
        return data
    def bounded(value,default,maximum=100):
        value=default if value is None else value
        if type(value) is not int or not 1<=value<=maximum:raise ValueError('Invalid collector batch')
        return value
    async def live(request):return response({'status':'alive','revision':revision,'runtime':'python','implementation':'python','timestamp':timestamp()})
    async def readiness(request):
        if not release_ready:return response({'status':'degraded','database':'unchecked','migration':'incomplete','timestamp':timestamp()},503)
        result=await health(runtime.database);return response(result,200 if result['status']=='ok' else 503)
    async def news_status(request):return response(runtime.scheduler.status())
    async def refresh(request):
        kind=request.path.split('/')[1]
        if kind=='indices':await runtime.scheduler.refresh(kind);return response({'status':'checked'})
        runtime.scheduler.spawn(runtime.scheduler.refresh(kind))
        return response({'status':'accepted',**(runtime.scheduler.status() if kind=='news' else {})},202)
    async def sources(request):return response(await runtime.sources.enabled())
    async def crawl(request):
        source_id=request.match_info['id'];source=await runtime.sources.get(source_id)
        if not source:return response({'error':'source_not_found','id':source_id},404)
        adapter=await runtime.registry.build(source_id)
        # The historical manual /sources route is specifically a generic crawl.
        io=adapter.io
        crawler=GenericCrawler(io,runtime.state,runtime.dead_letters)
        return response(await crawler.run(bounded((await body(request)).get('batchSize'),20)))
    async def adapter_request(request):
        source_id=request.match_info.get('sourceId','nse');source=await runtime.sources.get(source_id)
        if not source:return response({'error':'source_not_found','id':source_id},404)
        adapter=await runtime.registry.build(source_id)
        if 'sourceId' in request.match_info and not isinstance(adapter,RssAdapter):return response({'error':'source_adapter_mismatch'},400)
        if request.method=='GET':
            docs=await adapter.discover();return response({'count':len(docs),'documents':docs})
        return response(await runtime.runner.run(adapter))
    async def dead(request):return response(await runtime.dead_letters.list(request.query.get('source')))
    async def review(request):
        raw=request.query.get('limit');limit=100 if raw is None else int(raw)
        return response(await runtime.evidence.needs_review(bounded(limit,100)))
    async def reprocess(request):
        id=int(request.match_info['id'])
        if id<=0 or id>9007199254740991:return response({'error':'invalid_artifact_id'},400)
        return response(await runtime.extraction.reprocess(id))
    async def sweep(request):return response(await runtime.extraction.sweep(bounded((await body(request)).get('limit'),50)))
    async def status(request):return response(await crawl_status(runtime.database))
    async def bandwidth(request):return response(runtime.storage.r2.transfers.snapshot())
    async def market_read(request):
        async with asyncio.timeout(60):
            return response({'data':await runtime.market_source.read(await body(request)),'implementation':'python','runtime':'python'})
    app.add_routes([web.post('/internal/nse/read',market_read)])
    app.add_routes([web.get('/diagnostics/bandwidth',bandwidth,allow_head=False),web.get('/health/live',live,allow_head=False),web.get('/health',readiness,allow_head=False),web.get('/news/status',news_status,allow_head=False),
        web.post('/documents/refresh',refresh),web.post('/indices/refresh',refresh),web.post('/news/refresh',refresh),web.get('/sources',sources),web.post('/sources/{id}/crawl',crawl),
        web.get('/adapters/nse/announcements/preview',adapter_request),web.post('/adapters/nse/announcements',adapter_request),web.get('/dead-letters',dead),
        web.get('/adapters/rss/{sourceId}/preview',adapter_request),web.post('/adapters/rss/{sourceId}',adapter_request),web.get('/extractions/needs-review',review),
        web.post('/artifacts/{id}/reprocess',reprocess),web.post('/extractions/sweep',sweep),web.get('/crawl-status',status)])
    return app
