import asyncio
import pathlib
import sys
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.api import create_server,valid_operator_key,public_route
from continua_scraper.scheduler import CollectorScheduler
from continua_scraper.browser_proxy import BrowserProxy
from continua_scraper.policy import SourcePolicy

class Sources:
    async def enabled(self):return [{'id':'rss','adapter':'rss','enabled':True,'config':{},'redistributionAllowed':False}]
    async def get(self,id):return {'id':id,'adapter':'kenyanstocks' if id=='kenyanstocks' else 'rss','enabled':True,'redistributionAllowed':True,'config':{}}
class Registry:
    def __init__(self):self.calls=[];self.entered=asyncio.Event();self.release=asyncio.Event();self.release.set()
    async def run(self,id,**kwargs):self.calls.append(id);self.entered.set();await self.release.wait();return {'failed':0,'discovered':2,'extracted':2}
class Extraction:
    def __init__(self):self.calls=[]
    async def sweep(self,limit):self.calls.append(limit);return {'extracted':0}
    async def reprocess(self,id):self.calls.append(id);return {'id':id}
class Archive:
    async def run(self):return {'copied':0}

class APItests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from aiohttp.test_utils import TestClient,TestServer
        sources=Sources();registry=Registry();extraction=Extraction();scheduler=CollectorScheduler(sources,registry,extraction,Archive(),enabled=False)
        self.runtime=SimpleNamespace(sources=sources,registry=registry,extraction=extraction,scheduler=scheduler)
        self.key='fixture-private-operator-key-'+('x'*32)
        self.client=TestClient(TestServer(create_server(self.runtime,operator_key=self.key)))
        await self.client.start_server()
    async def asyncTearDown(self):await self.client.close();await self.runtime.scheduler.close()

    async def test_operator_routes_authenticate_before_operations(self):
        for method,path in [('GET','/sources'),('GET','/diagnostics/bandwidth'),('POST','/extractions/sweep'),('POST','/artifacts/1/reprocess'),('GET','/crawl-status'),('GET','/dead-letters'),('GET','/adapters/nse/announcements/preview')]:
            response=await self.client.request(method,path)
            self.assertEqual(response.status,401);self.assertEqual(response.headers['Cache-Control'],'no-store')
        self.assertEqual(self.runtime.extraction.calls,[])
        response=await self.client.get('/sources',headers={'X-Scraper-Admin-Key':self.key})
        self.assertEqual(response.status,200);self.assertEqual((await response.json())[0]['id'],'rss')

    async def test_public_refresh_is_bounded_and_release_remains_closed(self):
        for path in ['/documents/refresh','/news/refresh']:
            response=await self.client.post(path);self.assertEqual(response.status,202)
        response=await self.client.post('/indices/refresh');self.assertEqual(response.status,200)
        response=await self.client.get('/health');self.assertEqual(response.status,503)
        response=await self.client.get('/health/live');self.assertEqual(response.status,200)
        self.assertEqual((await response.json())['implementation'],'python');self.assertEqual(self.runtime.registry.calls,[])

    async def test_invalid_or_oversized_body_cannot_process_evidence(self):
        headers={'X-Scraper-Admin-Key':self.key}
        for payload in [{'limit':0},{'limit':True},{'limit':101},[]]:
            response=await self.client.post('/extractions/sweep',json=payload,headers=headers);self.assertEqual(response.status,400)
        response=await self.client.post('/extractions/sweep',data='x'*65537,headers=dict(headers,**{'Content-Type':'application/json'}));self.assertEqual(response.status,413)
        self.assertEqual(self.runtime.extraction.calls,[])
        response=await self.client.post('/extractions/sweep',json={'limit':2},headers=headers);self.assertEqual(response.status,200);self.assertEqual(self.runtime.extraction.calls,[2])

class SchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def test_shutdown_cancels_startup_backlog_and_releases_singleflight(self):
        registry=Registry();registry.release.clear()
        scheduler=CollectorScheduler(Sources(),registry,Extraction(),Archive(),enabled=True)
        task=scheduler.spawn(scheduler.source_once({'id':'fixture','adapter':'nse'}))
        await registry.entered.wait()
        await asyncio.wait_for(scheduler.close(grace_seconds=0),2)
        self.assertTrue(task.cancelled());self.assertEqual(scheduler.running,set())
        self.assertTrue(scheduler.queue.closed)

    async def test_source_and_reader_singleflight_share_cooldown(self):
        registry=Registry();registry.release.clear();scheduler=CollectorScheduler(Sources(),registry,Extraction(),Archive(),enabled=True)
        first=asyncio.create_task(scheduler.refresh('documents'));await registry.entered.wait()
        second=asyncio.create_task(scheduler.refresh('documents'));await asyncio.sleep(0)
        registry.release.set();await asyncio.gather(first,second)
        await scheduler.refresh('documents');self.assertEqual(registry.calls,['kenyanstocks'])
        await scheduler.close()

    async def test_browser_tunnel_denies_unapproved_or_private_destinations(self):
        policy=SourcePolicy('fixture',('fixture.example',),True)
        async with BrowserProxy(policy) as proxy:
            for target in ['127.0.0.1:443','evil.example:443','fixture.example:80','user:password@fixture.example:443']:
                reader,writer=await asyncio.open_connection('127.0.0.1',proxy.port)
                writer.write(f'CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n\r\n'.encode());await writer.drain()
                self.assertEqual(await asyncio.wait_for(reader.read(),2),b'');writer.close();await writer.wait_closed()

class AuthTests(unittest.TestCase):
    def test_operator_key_and_public_route_exact_match(self):
        self.assertFalse(valid_operator_key('key','key'));self.assertFalse(valid_operator_key('wrong','x'*32));self.assertTrue(valid_operator_key('x'*32,'x'*32))
        self.assertTrue(public_route('POST','/documents/refresh'));self.assertFalse(public_route('GET','/documents/refresh'));self.assertFalse(public_route('POST','/documents/refresh/extra'))
        # Private collection does not manufacture public redistribution rights.
        policy=SourcePolicy('fixture',('fixture.example',),False,collection_allowed=True)
        policy.check_url('https://fixture.example/source.pdf');self.assertFalse(policy.redistribution_allowed)

if __name__=='__main__':unittest.main()
