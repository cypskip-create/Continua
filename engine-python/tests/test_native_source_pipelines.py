import copy
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.feed_mapping import map_nse_batch,normalize_fundamentals_bundle
from continua_engine.candles import aggregate_touched_candles


class NativeSourcePipelineTests(unittest.TestCase):
    def test_sparse_registered_listing_does_not_gain_placeholder_company_or_sector(self):
        mapped=map_nse_batch('listing',[{'Symbol':'KCB','TradingStatus':'ACTIVE','Currency':'KES'}])[0]
        self.assertEqual(mapped['security']['id'],'NSE:KCB')
        self.assertNotIn('name',mapped['company'])
        self.assertEqual(mapped['sector'],{})
        self.assertNotIn('listedAt',mapped['security'])

    def test_quote_source_classification_is_not_invented(self):
        packet={'Symbol':'KCB','EventTimestamp':'2026-10-12T12:00:00Z','LastTradedPrice':90}
        with self.assertRaises(ValueError):map_nse_batch('quote',[packet])
        mapped=map_nse_batch('quote',[dict(packet,ObservationSource='delayed')])[0]
        self.assertEqual(mapped['source'],'delayed')
        self.assertNotIn('volume',mapped)
        self.assertNotIn('open',mapped)

    def test_incomplete_actions_and_ownership_do_not_get_placeholder_values(self):
        with self.assertRaises(ValueError):map_nse_batch('action',[{'Symbol':'KCB','ActionType':'SPLIT','AnnouncedDate':'2026-10-12','Payload':{}}])
        with self.assertRaises(ValueError):map_nse_batch('ownership',[{'Symbol':'KCB','HolderName':'Holder','SharesHeld':100,'AsOfDate':'2026-10-12'}])

    def test_nullable_fundamentals_remain_missing_not_zero(self):
        identifier='NSE:period:KCB:2025'
        bundle={'security':{'id':'NSE:KCB','symbol':'KCB','exchange':'NSE','companyId':'NSE:company:KCB','currency':'KES','status':'active'},
                'company':{'id':'NSE:company:KCB','name':'KCB','sectorId':'banking'},
                'sector':{'id':'banking','name':' banking '},'period':{'id':identifier},
                'income':{'periodId':identifier,'revenue':100,'netIncome':10,'eps':None},
                'balance':{'periodId':identifier,'totalAssets':200,'totalLiabilities':150,'totalEquity':50},
                'cashFlow':{'periodId':identifier,'freeCashFlow':None}}
        mapped=normalize_fundamentals_bundle(bundle)
        self.assertIsNone(mapped['income']['eps'])
        self.assertNotIn('operatingCashFlow',mapped['cashFlow'])
        self.assertNotIn('freeCashFlow',mapped['cashFlow'])
        self.assertEqual(mapped['sector']['name'],'Banking')
        corrupt=copy.deepcopy(bundle);corrupt['balance']['totalEquity']=500
        with self.assertRaises(ValueError):normalize_fundamentals_bundle(corrupt)

    def test_topup_rebuilds_touched_buckets_from_full_daily_history(self):
        def bar(day,close):return {'securityId':'NSE:KCB','interval':'1d','timestamp':f'2026-10-{day:02}T00:00:00Z','open':close,'high':close+1,'low':close-1,'close':close,'volume':100,'sourceUrl':'https://www.nse.co.ke/report.pdf'}
        history=[bar(12,90),bar(13,91),bar(14,92)]
        derived=aggregate_touched_candles([history[-1]],history)
        self.assertEqual({row['interval'] for row in derived},{'1w','1M','1y'})
        for row in derived:
            self.assertEqual(row['open'],90)
            self.assertEqual(row['close'],92)
            self.assertEqual(row['volume'],300)
        missing=copy.deepcopy(history);missing[0]['volume']=None
        with self.assertRaises(ValueError):aggregate_touched_candles([history[-1]],missing)


if __name__=='__main__':unittest.main()
