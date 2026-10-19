import asyncio
from datetime import datetime, timezone, timedelta
import pathlib
import sys
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.render_light import RenderLightScheduler, request_scope, reserve_request, route_allowed, slot_id
from continua_scraper.api import create_server

SOURCE=dict(id='nse-index-summary',adapter='web',enabled=True,config={})

class Database:
    def __init__(self):self.claims=set();self.calls=[]
    async def query(self,sql,args=()):
        self.calls.append((sql,args))
        if sql.startswith('INSERT INTO scraping.scheduled_runs'):
            if args[0] in self.claims:return []
            self.claims.add(args[0]);return [{'attempt':'1'}]
        return []

class Registry:
    def __init__(self,db):self.database=db;self.calls=[]
    async def run(self,id,**kwargs):
        self.calls.append((id,kwargs));reserve_request();return {'failed':0,'stored':1}

class Sources:
    async def get(self,id):return SOURCE

class GuardTests(unittest.TestCase):
    def test_scope_is_required_and_four_total_connections_are_allowed(self):
        with self.assertRaises(ValueError):reserve_request()
        with request_scope():
            for _ in range(4):reserve_request()
            with self.assertRaises(ValueError):reserve_request()
        with self.assertRaises(ValueError):reserve_request()
    def test_slot_survives_restart_and_changes_at_utc_boundary(self):
        at=datetime(2026,10,19,0,0,tzinfo=timezone.utc)
        self.assertEqual(slot_id(at),slot_id(at+timedelta(hours=5,minutes=59)))
        self.assertNotEqual(slot_id(at),slot_id(at+timedelta(hours=6)))
    def test_bulk_routes_and_internal_api_are_excluded(self):
        for method,path in [('POST','/news/refresh'),('POST','/documents/refresh'),('POST','/internal/nse/read'),('POST','/artifacts/1/reprocess'),('POST','/sources/x/crawl')]:
            self.assertFalse(route_allowed(method,path))
        self.assertTrue(route_allowed('GET','/health/live'));self.assertTrue(route_allowed('POST','/indices/refresh'))

class SchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def test_durable_slot_blocks_restart_duplicate_and_never_runs_bulk_source(self):
        db=Database();registry=Registry(db)
        for _ in range(2):
            scheduler=RenderLightScheduler(Sources(),registry,None,None,enabled=True)
            await scheduler.source_once(dict(SOURCE,id='other'))
            await scheduler.source_once(SOURCE,drain=True)
            await scheduler.source_once(SOURCE)
            self.assertEqual(scheduler.status()['owner'],'github-actions')
            with self.assertRaises(ValueError):await scheduler.refresh('documents')
            await scheduler.close()
        self.assertEqual(registry.calls,[('nse-index-summary',{'batch_size':1})])
        self.assertTrue(any('completed' in args for sql,args in db.calls if sql.startswith('UPDATE')))

    async def test_disabled_scheduler_never_claims_or_collects(self):
        db=Database();registry=Registry(db);scheduler=RenderLightScheduler(Sources(),registry,None,None,enabled=False)
        await scheduler.source_once(SOURCE);await scheduler.start();self.assertEqual(db.calls,[]);await scheduler.close()

    async def test_light_role_blocks_even_authenticated_bulk_http_requests(self):
        from aiohttp.test_utils import TestClient, TestServer
        scheduler=RenderLightScheduler(Sources(),Registry(Database()),None,None,enabled=False)
        runtime=SimpleNamespace(workload_role='render-light',scheduler=scheduler)
        client=TestClient(TestServer(create_server(runtime,operator_key='s'*32)))
        await client.start_server()
        try:
            for path in ('/news/refresh','/documents/refresh','/extractions/sweep','/internal/nse/read'):
                response=await client.post(path,headers={'X-Scraper-Admin-Key':'s'*32,'X-Collector-Market-Key':'s'*32})
                self.assertEqual(response.status,503)
            response=await client.get('/health/live');self.assertEqual(response.status,200)
        finally:await client.close();await scheduler.close()
