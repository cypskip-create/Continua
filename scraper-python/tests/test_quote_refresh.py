import asyncio
import pathlib
import sys
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.market_source import MarketSource


class Sources:
    def __init__(self):
        self.source={'id':'fixture','adapter':'mystocks','enabled':True,'redistributionAllowed':True,
                     'config':{'permissionReference':'fixture-only','quoteMappingApproved':'mystocks-literal-observations-v1'}}
    async def get(self,identifier):return self.source if identifier=='fixture' else None


class Scheduler:
    def __init__(self):self.enabled=True;self.tasks=[];self.calls=0;self.release=asyncio.Event()
    def spawn(self,coroutine):
        task=asyncio.create_task(coroutine);self.tasks.append(task);return task
    async def source_once(self,source):self.calls+=1;await self.release.wait();return {'extracted':1}


class QuoteRefreshTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.sources=Sources();self.scheduler=Scheduler()
        self.market=MarketSource(SimpleNamespace(sources=self.sources,scheduler=self.scheduler))
    async def asyncTearDown(self):
        self.scheduler.release.set()
        await asyncio.gather(*self.scheduler.tasks)

    async def test_refresh_is_nonblocking_singleflight_and_cooldown_bounded(self):
        body={'sourceId':'fixture','operation':'refresh-quotes'}
        first=await self.market.read(body);second=await self.market.read(body)
        self.assertTrue(first['accepted']);self.assertTrue(second['alreadyRunning'])
        self.assertEqual(len(self.scheduler.tasks),1)
        await asyncio.sleep(0)
        self.assertEqual(self.scheduler.calls,1)
        self.scheduler.release.set();await asyncio.gather(*self.scheduler.tasks)
        third=await self.market.read(body)
        self.assertEqual(third,{'accepted':False,'reason':'cooldown'})
        self.assertEqual(len(self.scheduler.tasks),1)

    async def test_disabled_scheduler_and_revoked_rights_never_claim_collection(self):
        body={'sourceId':'fixture','operation':'refresh-quotes'}
        self.scheduler.enabled=False
        self.assertEqual(await self.market.read(body),{'accepted':False,'reason':'scheduler_disabled'})
        self.sources.source['redistributionAllowed']=False
        with self.assertRaises(PermissionError):await self.market.read(body)
        self.assertEqual(self.scheduler.tasks,[])
