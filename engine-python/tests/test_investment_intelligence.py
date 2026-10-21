"""Independent synthetic numerical fixtures; never served as market data."""
import copy
import math
import unittest
from datetime import date,timedelta
from continua_engine.investment import run_investment

SOURCE='https://example.org/fixture'


class InvestmentTests(unittest.TestCase):
    def test_vintages_and_units(self):
        rows=[dict(series='inflation',date='2024-01-01',availableAt=d,value=v,unit='percent',frequency='monthly',sourceUrl=SOURCE)
              for d,v in [('2024-02-01',5),('2024-03-01',6)]]
        result=run_investment(dict(kind='macro',asOf='2024-02-15',observations=rows))
        self.assertEqual(result['data']['series'][0]['latest']['value'],5)
        self.assertEqual(run_investment(dict(kind='macro',asOf='2024-01-31',observations=rows))['data']['series'],[])

    def test_factor_missing_is_not_zero(self):
        rows=[dict(symbol=str(i),sector='bank',marketCap=100+i*100,roe=.1+i*.05,availableAt='2020-01-01',sourceUrl=SOURCE) for i in range(3)]
        result=run_investment(dict(kind='factors',asOf='2021-01-01',observations=rows))['data']
        self.assertEqual(len(result['exposures']),6)
        self.assertAlmostEqual(sum(x['exposure'] for x in result['exposures'] if x['factor']=='size'),0)
        self.assertNotIn('momentum',[x['factor'] for x in result['exposures']])

    def optimizer(self):
        return dict(kind='optimization',symbols=['A','B'],currentWeights=[.5,.5],
                    returns=[[math.sin(i)*.01,math.cos(i)*.02] for i in range(120)])

    def test_minimum_variance_and_risk_parity(self):
        p=self.optimizer()
        for objective in ('minimum-variance','risk-parity','maximum-diversification'):
            p['objective']=objective
            r=run_investment(p)
            self.assertEqual(r['status'],200,r)
            self.assertAlmostEqual(sum(r['data']['proposedWeights']),1,places=7)
            self.assertAlmostEqual(sum(r['data']['proposed']['contributions']),1,places=7)
            self.assertGreater(r['data']['proposedWeights'][0],.5)
        p['objective']='risk-parity'
        r=run_investment(p)['data']
        self.assertAlmostEqual(r['proposed']['contributions'][0],.5,places=4)

    def test_infeasible_and_turnover(self):
        p=self.optimizer();p['maximum']={'A':.2,'B':.2}
        self.assertEqual(run_investment(p)['status'],422)
        p=self.optimizer();p['turnoverCap']=0
        r=run_investment(p)
        self.assertEqual(r['status'],200,r)
        self.assertAlmostEqual(r['data']['proposedWeights'][0],.5,places=5)

    def test_independent_diagonal_covariance_solution(self):
        p=self.optimizer();del p['returns']
        p.update(covariance=[[.0001,0],[0,.0004]],observations=120)
        result=run_investment(p)
        self.assertEqual(result['status'],200,result)
        # 10% spherical shrinkage gives variances .000115 and .000385.
        # Independent Lagrange solution: inverse-variance weights, .77 and .23.
        self.assertAlmostEqual(result['data']['proposedWeights'][0],.77,places=5)
        p['covariance']=[[.0001,.2],[0,.0004]]
        self.assertEqual(run_investment(p)['status'],422)

    def test_optional_cash_and_unknown_constraints(self):
        p=self.optimizer();p['cashMaximum']=.2
        result=run_investment(p)
        self.assertEqual(result['status'],200,result)
        self.assertEqual(result['data']['symbols'][-1],'CASH')
        self.assertAlmostEqual(result['data']['proposedWeights'][-1],.2,places=5)
        self.assertEqual(result['data']['proposed']['contributions'][-1],0)
        p['maximum']={'UNKNOWN':.5}
        self.assertEqual(run_investment(p)['status'],422)

    def test_factor_covariance_reconciles_and_holdout_cannot_change_training(self):
        rows=[]
        for i in range(180):
            d=(date(2020,1,1)+timedelta(days=i)).isoformat();factor=math.sin(i)*.01
            rows.append(dict(date=d,availableAt=d,sourceUrl=SOURCE,factors={'market':factor},returns={'A':2*factor+.001*math.cos(i)}))
        p=dict(kind='factor-model',asOf='2021-01-01',factors=['market'],symbols=['A'],weights=[1],observations=rows)
        result=run_investment(p)
        self.assertEqual(result['status'],200,result)
        self.assertAlmostEqual(result['data']['loadings'][0][0],2,delta=.03)
        self.assertAlmostEqual(result['data']['reconciliationError'],0,places=15)
        altered=copy.deepcopy(p)
        for row in altered['observations'][120:]:row['returns']['A']+=.5
        self.assertEqual(result['data']['loadings'],run_investment(altered)['data']['loadings'])
        altered['observations'][10]['availableAt']='2022-01-01'
        self.assertEqual(run_investment(altered)['status'],422)

    def basket(self):
        return dict(kind='backtest',start='2020-01-01',end='2020-01-03',capital=1000,
            actionCoverageConfirmed=True,assets=[dict(symbol='A',basis='raw',availableAt='2019-01-01',sourceUrl=SOURCE,
            prices=[dict(date='2020-01-01',close=10),dict(date='2020-01-02',close=5),dict(date='2020-01-03',close=5)],
            actions=[dict(type='split',value=2,date='2020-01-02',availableAt='2020-01-01',sourceUrl=SOURCE),
                     dict(type='dividend',value=1,date='2020-01-03',exDate='2020-01-03',payDate='2020-01-03',availableAt='2020-01-01',sourceUrl=SOURCE)])])

    def test_split_dividend_cash_and_deterministic_snapshot(self):
        p=self.basket();r=run_investment(p)
        self.assertEqual(r['status'],200,r)
        self.assertEqual(r['data']['curve'][-1]['value'],1200)
        self.assertEqual(r['data']['holdings'][-1]['cash'],200)
        self.assertEqual(r['data']['snapshotId'],run_investment(copy.deepcopy(p))['data']['snapshotId'])
        self.assertEqual(r['data']['maxDrawdown'],0)

    def test_costs_reconcile_and_no_lookahead(self):
        p=self.basket();p['costBps']=100
        r=run_investment(p)['data']
        self.assertAlmostEqual(r['costs'],1000/101)
        self.assertAlmostEqual(r['curve'][0]['value']+r['costs'],1000)
        p['assets'][0]['availableAt']='2020-01-02'
        self.assertEqual(run_investment(p)['status'],422)

    def test_missing_suspension_and_unsupported_action_stop(self):
        p=self.basket();p['assets'].append(copy.deepcopy(p['assets'][0]));p['assets'][1]['symbol']='B'
        p['assets'][1]['prices'].pop(1)
        self.assertEqual(run_investment(p)['status'],422)

    def test_dividend_receivable_does_not_become_spendable_at_ex_date(self):
        p=self.basket();action=p['assets'][0]['actions'][1]
        action.update(date='2020-01-02',exDate='2020-01-02',payDate='2020-01-04')
        result=run_investment(p)
        self.assertEqual(result['status'],200,result)
        self.assertEqual(result['data']['curve'][-1]['value'],1200)
        self.assertEqual(result['data']['holdings'][-1]['cash'],0)
        self.assertEqual(result['data']['holdings'][-1]['dividendReceivable'],200)

    def test_benchmark_alignment_and_ratio_basis(self):
        p=self.basket();p['benchmark']=dict(sourceUrl=SOURCE,availableAt='2019-01-01',basis='total-return',points=[dict(date=d,value=v) for d,v in [('2020-01-01',100),('2020-01-02',100),('2020-01-03',120)]])
        p['annualization']=dict(sourceUrl=SOURCE,availableAt='2019-01-01',sessionsPerYear=252,riskFreeAnnual=.05)
        result=run_investment(p)
        self.assertEqual(result['status'],200,result)
        self.assertAlmostEqual(result['data']['metrics']['dailyTrackingError'],0)
        self.assertIn('sample standard deviation',result['data']['metrics']['ratioBasis'])
        p['benchmark']['points'].pop()
        self.assertEqual(run_investment(p)['status'],422)
        p=self.basket();p['assets'][0]['actions'][0]['type']='rights'
        self.assertEqual(run_investment(p)['status'],422)

    def test_macro_scenario_has_no_invented_price_impact(self):
        r=run_investment(dict(kind='macro-scenario',asOf='2020-01-01',exposures=[dict(label='Debt',basis='user-assumption',amount=100,currency='USD',shock=.1)]))
        self.assertEqual(r['data']['exposures'][0]['directChange'],10)
        self.assertNotIn('priceImpact',r['data'])
