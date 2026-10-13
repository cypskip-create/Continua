import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.sources import Sources
from continua_scraper.crawl_state import CrawlState

class DatabaseFixture:
    def __init__(self):self.calls=[]
    async def query(self,sql,params=()):
        self.calls.append((sql,params))
        return []

class SourceCheckpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_boot_source_install_keeps_operator_disables_and_permissions(self):
        database=DatabaseFixture()
        await Sources(database).save({"id":"fixture","name":"Fixture","adapter":"fixture","enabled":False,"config":{},"redistributionAllowed":False,"attributionRequired":True},only_if_missing=True)
        sql,params=database.calls[0]
        self.assertIn("ON CONFLICT(id) DO NOTHING",sql)
        self.assertFalse(params[3])
        self.assertFalse(params[-2])

    async def test_claims_are_restart_safe_and_mutations_use_lease_identity(self):
        database=DatabaseFixture()
        state=CrawlState(database)
        await state.claim("fixture",10)
        self.assertIn("FOR UPDATE SKIP LOCKED",database.calls[0][0])
        self.assertIn("interval '1 hour'",database.calls[0][0])
        await state.crawling(42,"fixture-lease")
        await state.crawled(42,"fixture-lease",200,"application/pdf","a"*64,True)
        await state.failed(42,"fixture-lease","fixture")
        for sql,params in database.calls[1:]:
            self.assertIn("last_seen=%s",sql)
            self.assertIn("fixture-lease",params)

    async def test_unbounded_claims_rejected_without_queries(self):
        database=DatabaseFixture()
        for limit in (0,101,True):
            with self.assertRaises(ValueError):await CrawlState(database).claim("fixture",limit)
        self.assertEqual(database.calls,[])

if __name__=="__main__":unittest.main()
