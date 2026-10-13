import asyncio
import json
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.documents import DocumentJobs
from continua_scraper.serial import SerialWorkQueue,QueueFull
from continua_scraper.tabs import stock_tab_documents

class FakeDatabase:
    def __init__(self):
        self.calls=[]

    async def query(self,sql,params=()):
        self.calls.append((sql,params))
        return []

class JobTests(unittest.IsolatedAsyncioTestCase):
    async def test_enqueue_batches_and_keeps_retry_states(self):
        database=FakeDatabase()
        jobs=DocumentJobs(database)
        await jobs.enqueue("fixture",[{"url":f"https://fixture.example/{i}"} for i in range(401)])
        self.assertEqual([len(json.loads(params[1])) for _,params in database.calls],[200,200,1])
        self.assertTrue(all("interval '7 days'" in sql for sql,_ in database.calls))

    async def test_claim_reclaims_expired_leases_and_skip_locked(self):
        database=FakeDatabase()
        await DocumentJobs(database).claim("kenyanstocks",10)
        sql,params=database.calls[0]
        self.assertIn("lease_until<now()",sql)
        self.assertIn("FOR UPDATE SKIP LOCKED",sql)
        self.assertIn("attempts=j.attempts+1",sql)
        self.assertEqual(params,("kenyanstocks",10))

    async def test_finish_uses_attempt_token_and_bounded_error(self):
        database=FakeDatabase()
        await DocumentJobs(database).finish(123,4,"x"*2000)
        sql,params=database.calls[0]
        self.assertIn("WHERE id=%s AND attempts=%s",sql)
        self.assertEqual(params[0],"failed")
        self.assertEqual(len(params[1]),1000)
        self.assertEqual(params[2:],(123,4))

    async def test_invalid_batch_rejected_before_database(self):
        database=FakeDatabase()
        for limit in (0,26,True):
            with self.assertRaises(ValueError):
                await DocumentJobs(database).claim("fixture",limit)
        self.assertEqual(database.calls,[])

class SerialQueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_heavy_job_failure_does_not_poison_later_work(self):
        queue=SerialWorkQueue()
        active=0
        peak=0
        async def work():
            nonlocal active,peak
            active+=1
            peak=max(peak,active)
            await asyncio.sleep(0)
            active-=1
            return "done"
        self.assertEqual(await asyncio.gather(*(queue.run(work) for _ in range(20))),["done"]*20)
        self.assertEqual(peak,1)
        async def failure():
            raise ValueError("fixture")
        with self.assertRaises(ValueError):
            await queue.run(failure)
        self.assertEqual(await queue.run(work),"done")

    async def test_queue_is_bounded_and_cancelled_waiter_releases_capacity(self):
        queue=SerialWorkQueue(max_waiting=2)
        started=asyncio.Event()
        release=asyncio.Event()
        async def leader():
            started.set()
            await release.wait()
        first=asyncio.create_task(queue.run(leader))
        await started.wait()
        second=asyncio.create_task(queue.run(leader))
        await asyncio.sleep(0)
        with self.assertRaises(QueueFull):
            await queue.run(leader)
        second.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await second
        self.assertEqual(queue.waiting,1)
        release.set()
        await first
        self.assertEqual(queue.waiting,0)
        await queue.close()
        with self.assertRaises(RuntimeError):
            await queue.run(leader)

class TabPlanTests(unittest.TestCase):
    def test_all_tabs_and_financial_subcategories_are_resumable(self):
        documents=stock_tab_documents("https://kenyanstocks.com/stock/nse/COOP?ignored=1#section")
        self.assertEqual(len(documents),12)
        self.assertEqual(len(set(d["url"] for d in documents)),12)
        self.assertEqual(len([d for d in documents if d["context"]["tab"]=="Financials"]),5)
        self.assertTrue(any(d["context"]["historyStart"]=="2015-01-01" for d in documents))

    def test_observed_new_tabs_supported_wrong_origins_rejected(self):
        docs=stock_tab_documents("https://kenyanstocks.com/stock/nse/COOP",["New Information","New Information"])
        self.assertEqual(len(docs),1)
        for url in ("https://evil.test/stock/nse/COOP","https://user@kenyanstocks.com/stock/nse/COOP","https://kenyanstocks.com/stock/nse/coop"):
            self.assertEqual(stock_tab_documents(url),[])

if __name__=="__main__":unittest.main()
