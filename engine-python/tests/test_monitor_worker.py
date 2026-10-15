import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.monitoring import monitor_evaluation

class MonitorWorkerTests(unittest.TestCase):
    def test_future_and_stale_prices_cannot_trigger(self):
        rule={'kind':'price_above','threshold':10,'last_state':{'triggered':False}}
        for at in ['2026-10-15T00:00:00Z','2026-09-01T00:00:00Z',None]:
            result=monitor_evaluation(rule,{'quote':{'lastPrice':30,'timestamp':at}},'2026-10-14T12:00:00Z')
            self.assertFalse(result['state']['notify']);self.assertTrue(result['state']['unavailable'])
    def test_missing_fingerprint_retains_baseline(self):
        result=monitor_evaluation({'kind':'material_change','last_state':{'fingerprint':'old'}},{'changes':{'changes':[{'material':True,'text':'Literal evidence'}]}},'2026-10-14T12:00:00Z')
        self.assertFalse(result['state']['notify']);self.assertEqual(result['state']['fingerprint'],'old')
    def test_recorded_threshold_is_dated_and_transition_based(self):
        rule={'kind':'price_above','threshold':10,'last_state':{'triggered':False}}
        bundle={'quote':{'lastPrice':30,'timestamp':'2026-10-14T10:00:00Z'}}
        r=monitor_evaluation(rule,bundle,'2026-10-14T12:00:00Z')
        self.assertTrue(r['state']['notify']);self.assertEqual(r['eventKey'],'2026-10-14:price_above')
        rule['last_state']=r['state'];self.assertFalse(monitor_evaluation(rule,bundle,'2026-10-14T13:00:00Z')['state']['notify'])
