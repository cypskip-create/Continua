import importlib.util
import pathlib
import subprocess
import sys
import unittest

root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location('scheduled_collect',root/'scheduled_collect.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ScheduledTests(unittest.TestCase):
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
