import pathlib
import sys
import unittest
from datetime import datetime, timedelta, timezone
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.execution import simulate_execution,backtest,volume_profile

def bars(n=100):
    return [{'timestamp':(datetime(2024,1,1,tzinfo=timezone.utc)+timedelta(days=i)).isoformat().replace('+00:00','Z'),
             'open':10+i%10,'close':10+i%10,'low':9+i%10,'high':11+i%10,'volume':1000000} for i in range(n)]

class ExecutionTests(unittest.TestCase):
    def test_prior_signal_next_open_and_zero_volume_skips(self):
        b=bars(3);options={'initialCapital':100,'feeBps':0,'slippageBps':0,'maxVolumeParticipation':.01}
        r=simulate_execution(b,['buy','sell','hold'],options)
        self.assertEqual(r['trades'][0]['entryDate'],b[1]['timestamp'])
        self.assertEqual(r['trades'][0]['exitDate'],b[2]['timestamp'])
        b[1]['volume']=0;r=simulate_execution(b,['buy','sell','hold'],options)
        self.assertEqual(r['skipped'],1);self.assertEqual(r['trades'],[])

    def test_missing_volume_is_unavailable_not_fabricated(self):
        b=bars();b[0]['volume']=None
        self.assertIsNone(volume_profile(b,'KCB','NSE','2024-01-01','2024-12-31'))
        self.assertIsNone(backtest(b,{'strategy':'sma_cross'},[]))

    def test_corporate_action_and_degenerate_history_guards(self):
        b=bars();req={'symbol':'KCB','exchange':'NSE','strategy':'sma_cross','from':'2024-01-01','to':'2024-12-31'}
        r=backtest(b,req,[{'type':'split','status':'confirmed','effectiveDate':'2024-02-01'}])
        self.assertIn('blocked',r)
        r=backtest(b,req,[]);self.assertEqual(r['execution']['initialCapital'],100000)
        self.assertIsNotNone(r['evaluation']['outOfSampleReturn'])
        for bar in b: bar.update({'open':10,'close':10,'high':10,'low':10})
        self.assertIsNone(volume_profile(b,'KCB','NSE','2024-01-01','2024-12-31'))
