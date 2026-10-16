import importlib.util
import pathlib
import subprocess
import sys
import unittest
from contextlib import asynccontextmanager

root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location('scheduled_collect',root/'scheduled_collect.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ScheduledTests(unittest.TestCase):
    def test_kenyanstocks_is_primary_without_removing_fallbacks(self):
        rows=[{'adapter':'nse'},{'adapter':'kenyanstocks'},{'adapter':'afx'}]
        for hour in range(3):
            ordered=module.ordered_sources(rows,'documents',hour)
            self.assertEqual(ordered[0]['adapter'],'kenyanstocks')
            self.assertEqual(len(ordered),3)
    def test_limits_fail_closed(self):
        self.assertEqual(module.limits({}),[33554432,134217728,600,5])
        for config in ({'COLLECTOR_RUN_SECONDS':'0'},{'COLLECTOR_RUN_TRANSFER_BYTES':'-1'},{'COLLECTOR_SOURCE_LIMIT':'100'},{'COLLECTOR_DAILY_TRANSFER_BYTES':'1'}):
            with self.assertRaises(ValueError):module.limits(config)
    def test_offline_plan_needs_no_credentials(self):
        result=subprocess.run([sys.executable,str(root/'scheduled_collect.py'),'--kind','documents'],capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('"submitted": false',result.stdout)
    def test_workflow_has_no_render_dependency(self):
        workflow=(root.parent/'.github/workflows/scheduled-collector.yml').read_text()
        self.assertNotIn('onrender.com',workflow)
        self.assertIn('cancel-in-progress: false',workflow)
        self.assertIn('persist-credentials: false',workflow)
        self.assertIn('default: false',workflow)
        self.assertIn("github.event.schedule == '17 */8 * * *' && vars.CONTINUA_SCHEDULED_NEWS_ENABLED == 'true'",workflow)
        self.assertIn("github.event.schedule == '43 20 * * *' && vars.CONTINUA_SCHEDULED_DOCUMENTS_ENABLED == 'true'",workflow)
        self.assertNotIn('vars.CONTINUA_SCHEDULED_SCRAPER_ENABLED',workflow)

class SlotTests(unittest.IsolatedAsyncioTestCase):
    async def test_slot_uses_transaction_guard_and_cleans_failed_exit(self):
        class DB:
            def __init__(self):self.calls=[];self.results=[[{'acquired':True}],[],[],[{'day':'fixture'}],[]]
            @asynccontextmanager
            async def transaction(self):yield self
            async def query(self,sql,params=()):
                self.calls.append((sql,params));return self.results.pop(0) if self.results else []
        db=DB()
        with self.assertRaises(RuntimeError):
            async with module.scheduled_slot(db,'fixture','documents',16,128) as skipped:
                self.assertIsNone(skipped);raise RuntimeError('fixture')
        self.assertIn('pg_try_advisory_xact_lock',db.calls[0][0])
        self.assertIn("interval '30 minutes'",db.calls[2][0])
        self.assertEqual(db.calls[3][1],(16,128))
        self.assertIn("status='running'",db.calls[-1][0])
    async def test_overlap_does_not_reserve_bandwidth(self):
        class DB:
            calls=[]
            @asynccontextmanager
            async def transaction(self):yield self
            async def query(self,sql,params=()):self.calls.append(sql);return [{'acquired':False}]
        db=DB()
        async with module.scheduled_slot(db,'fixture','documents',16,128) as skipped:self.assertEqual(skipped,'overlap-skipped')
        self.assertEqual(len(db.calls),1)
