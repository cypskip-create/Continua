import asyncio
import os
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.event_loop import database_event_loop
from continua_scraper.process import run_process

_previous_policy=None
def setUpModule():
    global _previous_policy
    if os.name=='nt' and sys.version_info<(3,13):
        _previous_policy=asyncio.get_event_loop_policy()
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
def tearDownModule():
    if _previous_policy is not None:asyncio.set_event_loop_policy(_previous_policy)

@unittest.skipUnless(os.name=='nt','Windows selector/process integration only')
class WindowsProcessLoopTests(unittest.IsolatedAsyncioTestCase):
    loop_factory=staticmethod(database_event_loop)
    async def test_database_loop_keeps_bounded_native_subprocesses(self):
        self.assertIsInstance(asyncio.get_running_loop(),asyncio.SelectorEventLoop)
        result=await run_process([sys.executable,'-c','print("native-fixture")'],max_output=100)
        self.assertEqual(result.strip(),b'native-fixture')
        with self.assertRaises(TimeoutError):await run_process([sys.executable,'-c','import time;time.sleep(10)'],timeout=.1)
        with self.assertRaises(ValueError):await run_process([sys.executable,'-c','print("x"*10000)'],max_output=10)
        task=asyncio.create_task(run_process([sys.executable,'-c','import time;time.sleep(10)']))
        await asyncio.sleep(.1);task.cancel()
        with self.assertRaises(asyncio.CancelledError):await task
