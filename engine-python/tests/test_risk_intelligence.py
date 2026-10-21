import copy
import datetime
import math
import unittest
from statistics import stdev
from continua_engine.risk_intelligence import build_risk_intelligence, simulate_risk, stock_risk


class RiskIntelligenceTests(unittest.TestCase):
    def test_factor_descriptors_use_source_linked_calendar_anchors_and_real_volume(self):
        now='2026-10-20T15:00:00Z';bars=[];day=datetime.date(2025,9,15)
        while day<=datetime.date(2026,10,20):
            if day.weekday()<5:bars.append(dict(timestamp=day.isoformat()+'T12:00:00Z',close=100+len(bars),volume=1000,sourceUrl='https://source.example/observed'))
            day+=datetime.timedelta(days=1)
        bundle=dict(symbol='A',currency='KES',quote=dict(lastPrice=bars[-1]['close'],timestamp=now,volume=1000,source='fixture'))
        result=stock_risk(bundle,bars,[],now);f=result['factorDescriptors']
        self.assertIsNotNone(f['momentum12mEx1m'])
        close={b['timestamp'][:10]:b['close'] for b in bars}
        self.assertAlmostEqual(f['momentum12mEx1m'],close[f['momentumEnd']]/close[f['momentumStart']]-1)
        from statistics import median
        self.assertEqual(f['medianTradedValue60d'],median(b['close']*1000 for b in bars[-60:]))
        bars[-1]['volume']=None
        self.assertIsNone(stock_risk(bundle,bars,[],now)['factorDescriptors']['medianTradedValue60d'])
        blocked=stock_risk(bundle,bars,[dict(type='split',status='confirmed',effectiveDate='2025-10-01')],now)
        self.assertIsNone(blocked['factorDescriptors']['momentum12mEx1m'])
    def setUp(self):
        self.now='2026-10-20T15:00:00Z'
        dates=[]; day=datetime.date(2026,7,1)
        while day<=datetime.date(2026,10,20):
            if day.weekday()<5:dates.append(day.isoformat())
            day+=datetime.timedelta(days=1)
        self.positions=[dict(symbol=s,shares=10,price=p,cost=100,currency='KES',sector=sector,asOf=self.now,volume=1000,change=0)
                        for s,p,sector in [('A',80,'Banking'),('B',20,'Energy')]]
        self.histories=[]
        self.returns=[]
        for symbol,mult in [('A',1),('B',-.5)]:
            price=100;bars=[]
            for i,date in enumerate(dates):
                r=(.02 if i%2 else -.01)*mult
                if i:price*=1+r
                if symbol=='A' and i:self.returns.append(r)
                bars.append(dict(timestamp=date+'T12:00:00Z',close=price,sourceUrl='https://source.example/observed'))
            self.histories.append(dict(symbol=symbol,bars=bars,blocked=False))
        self.snapshot=build_risk_intelligence(self.positions,self.histories,self.now)

    def test_weights_volatility_and_negative_attribution_reconcile(self):
        r=self.snapshot
        self.assertEqual(r['weights'],[.8,.2])
        self.assertAlmostEqual(r['overview']['dailyVolatility'],stdev([v*.7 for v in self.returns])*100)
        self.assertAlmostEqual(sum(p['riskPercent'] for p in r['attribution']['contributions']),100)
        self.assertLess(next(p['riskPercent'] for p in r['attribution']['contributions'] if p['symbol']=='B'),0)
        self.assertLess(abs(r['attribution']['reconciliationError']),1e-8)
        self.assertIsNone(r['overview']['annualizedVolatility'])

    def test_pairwise_dates_and_no_filled_returns(self):
        histories=copy.deepcopy(self.histories)
        del histories[1]['bars'][15]
        r=build_risk_intelligence(self.positions,histories,self.now)
        self.assertEqual(r['pairs'][0]['observations'],len(self.returns)-2)
        self.assertAlmostEqual(r['pairs'][0]['correlation'],-1)
        self.assertTrue(r['pairs'][0]['rolling'])

    def test_stock_diagnostics_never_claim_that_unit_exposure_is_owned(self):
        result=stock_risk({'symbol':'A','currency':'KES','quote':{'lastPrice':80,'timestamp':self.now,'source':'observed'}},self.histories[0]['bars'],[],self.now)
        self.assertTrue(result['stockDiagnostic'])
        self.assertIn('not an owned holding',result['evidence']['performanceBasis'])
        self.assertAlmostEqual(result['stocks'][0]['dailyVolatility'],stdev(self.returns)*100)

    def test_coverage_accounts_for_stale_missing_and_corporate_actions(self):
        self.positions[1]['asOf']='2025-01-01'
        self.positions.append(dict(symbol='C',shares=2,price=None,cost=10,currency='KES'))
        self.histories[0]['blocked']=True
        r=build_risk_intelligence(self.positions,self.histories,self.now)
        self.assertEqual(len(r['coverage']),3)
        self.assertEqual(r['evidence']['quality'],'insufficient_observations')
        self.assertTrue(all(not c['included'] for c in r['coverage']))
        self.assertIsNone(r['overview']['dailyVolatility'])

    def test_stress_overlap_and_reallocation_preserve_snapshot(self):
        before=copy.deepcopy(self.snapshot)
        options=dict(weights={'A':.5,'B':.25},cashWeight=.25,
                     scenario=dict(marketShock=-.1,sectorShocks={'Banking':-.2},topFiveShock=-.3,holdingShocks={'A':-.4}))
        r=simulate_risk(self.snapshot,options)
        self.assertEqual(r['status'],200)
        self.assertAlmostEqual(r['data']['current']['pnl'],-380)
        self.assertAlmostEqual(r['data']['proposed']['pnl'],-275)
        self.assertEqual(self.snapshot,before)
        self.assertAlmostEqual(r['data']['proposed']['stressedValue'],725)
        self.assertAlmostEqual(r['data']['attribution']['dailyVolatility'],stdev([v*.375 for v in self.returns])*100)

    def test_replay_uses_recorded_windows_and_rejects_fabricated_dates(self):
        replay=self.snapshot['replays'][0]
        result=simulate_risk(self.snapshot,{'scenario':{'historicalReplay':replay['id']}})
        self.assertEqual(result['status'],200)
        self.assertEqual(result['data']['historicalReplay']['observations'],20)
        self.assertAlmostEqual(result['data']['current']['pnl'],sum(p['value']*replay['holdingShocks'][p['symbol']] for p in self.snapshot['overview']['positions']))
        self.assertEqual(simulate_risk(self.snapshot,{'scenario':{'historicalReplay':'invented-crisis'}})['status'],400)

    def test_rejects_invalid_weights_limits_names_and_nonfinite_shocks(self):
        for options in [dict(weights={'A':1.1,'B':-.1}),dict(weights={'A':.5,'B':.2}),
                        dict(weights={'A':1}),dict(maxHoldingWeight=.7),dict(maxSectorWeight=.7),
                        dict(scenario={'holdingShocks':{'other':-.2}}),dict(scenario={'marketShock':math.nan}),
                        dict(scenario={'marketShock':-1.01}),dict(scenario={'unsupported':1})]:
            self.assertEqual(simulate_risk(self.snapshot,options)['status'],400,options)

    def test_more_than_ten_holdings_are_reported(self):
        positions=[];histories=[]
        for i in range(13):
            symbol=str(i);p=dict(self.positions[0],symbol=symbol)
            positions.append(p);histories.append(dict(self.histories[0],symbol=symbol))
        r=build_risk_intelligence(positions,histories,self.now)
        self.assertEqual(len(r['coverage']),13)
        self.assertEqual(len(r['symbols']),13)
        self.assertEqual(len(r['attribution']['contributions']),13)

    def test_unsupported_proposed_covariance_is_not_partial_risk(self):
        self.histories[1]['blocked']=True
        r=build_risk_intelligence(self.positions,self.histories,self.now)
        proposed=simulate_risk(r,{})
        self.assertEqual(proposed['status'],200)
        self.assertIsNone(proposed['data']['attribution']['dailyVolatility'])


if __name__=='__main__':unittest.main()
