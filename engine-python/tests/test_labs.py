import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.labs import lab_calculation

class LabTests(unittest.TestCase):
    def test_futures_are_user_assumptions_not_trade_execution(self):
        raw={'entry':100,'settlement':105,'multiplier':10,'contracts':2,'side':'long','margin':1000,'expiry':'2026-12-01','asOf':'2026-10-14','shockPercent':-10}
        result=lab_calculation('futures',raw,'2026-10-14T12:00:00Z')
        self.assertEqual(result['status'],200);self.assertEqual(result['data']['pnl'],100)
        self.assertEqual(lab_calculation('futures',{**raw,'contracts':True},'2026-10-14T12:00:00Z')['status'],400)
    def test_regular_coupons_and_future_flows_required(self):
        raw={'settlement':'2026-03-01','previousCoupon':'2026-01-01','nextCoupon':'2026-07-01','couponPerPeriod':5,'yieldPercent':10,'frequency':2,'cashFlows':[{'date':'2026-07-01','amount':105}],'shockBps':100}
        result=lab_calculation('bond',raw,'2026-10-14T12:00:00Z')
        self.assertEqual(result['status'],200);self.assertGreater(result['data']['dirtyPrice'],result['data']['cleanPrice'])
        self.assertEqual(lab_calculation('bond',{**raw,'nextCoupon':'2026-03-02'},'2026-10-14T12:00:00Z')['status'],400)
        self.assertEqual(lab_calculation('bond',{**raw,'cashFlows':[{'date':'2026-02-01','amount':105}]},'2026-10-14T12:00:00Z')['status'],400)
