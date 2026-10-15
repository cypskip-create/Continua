import pathlib
import sys
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.api import create_server


class Market:
    def __init__(self):self.calls=[]
    async def read(self,data):self.calls.append(data);return []


class PrivateMarketAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from aiohttp.test_utils import TestClient,TestServer
        self.market=Market();self.runtime=SimpleNamespace(market_source=self.market)
        self.market_key='m'*32;self.admin_key='a'*32
        self.client=TestClient(TestServer(create_server(self.runtime,operator_key=self.admin_key,market_key=self.market_key)))
        await self.client.start_server()

    async def asyncTearDown(self):await self.client.close()

    async def test_market_and_operator_keys_are_not_interchangeable(self):
        body={'sourceId':'fixture','operation':'securities'}
        for headers in ({},{'X-Scraper-Admin-Key':self.admin_key},{'X-Collector-Market-Key':self.admin_key}):
            response=await self.client.post('/internal/nse/read',json=body,headers=headers)
            self.assertEqual(response.status,401)
        self.assertEqual(self.market.calls,[])
        response=await self.client.post('/internal/nse/read',json=body,headers={'X-Collector-Market-Key':self.market_key})
        self.assertEqual(response.status,200)
        self.assertEqual((await response.json())['implementation'],'python')
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        response=await self.client.post('/extractions/sweep',json={},headers={'X-Collector-Market-Key':self.market_key})
        self.assertEqual(response.status,401)

    async def test_oversized_source_packet_never_enters_transport(self):
        response=await self.client.post('/internal/nse/read',data='x'*65537,headers={'X-Collector-Market-Key':self.market_key,'Content-Type':'application/json'})
        self.assertEqual(response.status,413)
        self.assertEqual(self.market.calls,[])
