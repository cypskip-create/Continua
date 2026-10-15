import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.feed_mapping import map_feed,normalize_feed
from continua_engine.publication import balance_integrity

class FeedTests(unittest.TestCase):
    def test_nairobi_feed_time_and_missing_volume_remain_literal(self):
        row=map_feed('quote',{'Symbol':'KCB','EventTimestamp':'2026-10-14T15:00:00','LastTradedPrice':30,'Currency':'KES','TradingStatus':'ACTIVE'})
        self.assertEqual(row['timestamp'],'2026-10-14T12:00:00.000Z')
        self.assertNotIn('volume',row)
        with self.assertRaises((KeyError,ValueError,TypeError)):normalize_feed('price',row)
    def test_missing_cashflow_is_not_zero_and_quarter_id_is_stable(self):
        self.assertEqual(normalize_feed('cashflow',{'periodId':'p','capex':2}),{'periodId':'p','capex':2})
        result=map_feed('financials',{'Symbol':'KCB','FiscalYear':2025,'FiscalQuarter':2,'PeriodType':'QUARTERLY','Currency':'KES'})
        self.assertEqual(result['period']['id'],'NSE:period:KCB:2025Q2')
        self.assertNotIn('revenue',result['income'])
    def test_zero_or_negative_assets_cannot_bypass_reconciliation(self):
        self.assertFalse(balance_integrity({'totalAssets':0,'totalLiabilities':2,'totalEquity':2}))
        self.assertFalse(balance_integrity({'totalAssets':-10,'totalLiabilities':2,'totalEquity':-12}))
        self.assertTrue(balance_integrity({'totalAssets':10,'totalLiabilities':12,'totalEquity':-2}))
