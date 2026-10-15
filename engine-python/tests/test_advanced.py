import pathlib
import sys
import unittest
from datetime import date,timedelta
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.advanced import run_advanced

class AdvancedTests(unittest.TestCase):
    def setUp(self):
        self.points=[{'date':(date(2024,1,1)+timedelta(days=i)).isoformat(),'close':100+i/10} for i in range(181)]
        self.base={'points':self.points,'sourceUrl':'https://fixture.example/prices'}
    def test_seeded_bootstrap_is_reproducible_and_bounded(self):
        request={**self.base,'kind':'bootstrap','paths':100,'horizon':10,'seed':123,'blockSize':5}
        r=run_advanced(request,'2026-10-14T12:00:00Z')
        self.assertEqual(r['status'],200);self.assertEqual(r,run_advanced(request,'2026-10-14T12:00:00Z'))
        self.assertEqual(len(r['data']['curve']),11)
        self.assertEqual(run_advanced({**request,'paths':1001},'2026-10-14T12:00:00Z')['status'],400)
    def test_missing_dates_and_future_records_are_not_interpolated(self):
        request={**self.base,'kind':'replay','start':'2024-01-01','end':'2024-06-29'}
        self.assertEqual(run_advanced(request,'2026-10-14T12:00:00Z')['status'],200)
        self.assertEqual(run_advanced({**request,'points':self.points[1:]},'2026-10-14T12:00:00Z')['status'],422)
        self.assertEqual(run_advanced({**request,'points':[self.points[0],self.points[10]]},'2026-10-14T12:00:00Z')['status'],422)
    def test_mixed_valuation_dates_do_not_aggregate(self):
        p={'name':'Cash','assetClass':'cash','value':100,'asOf':'2024-01-01','sourceUrl':'https://fixture.example/a'}
        request={'kind':'cross-asset','currency':'KES','positions':[p,{**p,'asOf':'2024-01-02'}]}
        self.assertEqual(run_advanced(request,'2026-10-14T12:00:00Z')['status'],422)
        self.assertEqual(run_advanced({**request,'userId':'other'},'2026-10-14T12:00:00Z')['status'],400)
