import sys
import pathlib
import unittest
from datetime import date,timedelta
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'backend/python'))
from institutional_intelligence import run,forecast,monte_carlo,liquidity,graph,research_case,relationship_draft
from investment_intelligence import run_investment

SOURCE='https://fixture.invalid/source'
def rows(n=500):
 import numpy as np
 rng=np.random.Generator(np.random.PCG64(42))
 return [dict(date=(date(2026,10,21)-timedelta(days=n-1-i)).isoformat(),availableAt=(date(2026,10,21)-timedelta(days=n-1-i)).isoformat(),sourceUrl=SOURCE,value=float(rng.normal(0,.01))) for i in range(n)]

class InstitutionalTests(unittest.TestCase):
 def mc(self):
  r=rows(200)
  return dict(kind='monte-carlo',asOf='2026-10-21',symbols=['A','B'],weights=[.4,.5],capital=1000,currency='KES',horizon=10,paths=400,seed=7,basis='price-only',returns=[dict(x,values=[x['value'],x['value']*2]) for x in r])
 def test_seeded_paths_and_tail_contributions_reconcile(self):
  a=monte_carlo(self.mc());b=monte_carlo(self.mc())
  self.assertEqual(a,b);self.assertAlmostEqual(sum(x['loss'] for x in a['tailContributions']),a['expectedShortfall'],8)
  self.assertGreaterEqual(a['expectedShortfall'],a['valueAtRisk'])
 def test_paired_dependence_is_preserved(self):
  p=self.mc();p.update(weights=[.5,.5],horizon=1,method='historical-bootstrap');p['returns']=[dict(r,values=[r['values'][0],-r['values'][0]]) for r in p['returns']]
  result=monte_carlo(p)
  for q in result['quantiles'].values():self.assertAlmostEqual(q,1000,8)
 def test_scenario_losses_include_initial_shock(self):
  p=self.mc();p['returns']=[dict(r,values=[0,0]) for r in p['returns']];p['shocks']={'A':-.5}
  r=monte_carlo(p);self.assertAlmostEqual(r['valueAtRisk'],200);self.assertEqual(r['thresholdBreachProbability'],1)
 def test_rebalancing_costs_reduce_value_and_tail_reconciles(self):
  p=self.mc();p.update(rebalance='daily',costBps=50);a=monte_carlo(p);p['costBps']=0;b=monte_carlo(p)
  self.assertGreater(a['meanRebalancingCosts'],0);self.assertLess(a['quantiles']['p50'],b['quantiles']['p50'])
  self.assertAlmostEqual(a['tailReconciliationError'],0,8)
 def test_limits_and_basis_fail_closed(self):
  p=self.mc();p.update(paths=5000,horizon=252,symbols=['A']*70)
  with self.assertRaises(ValueError):monte_carlo(p)
  p=self.mc();p['basis']='guessed-dividends'
  with self.assertRaises(ValueError):monte_carlo(p)
 def test_insufficient_tail_mass_is_withheld(self):
  p=self.mc();p.update(paths=200,confidence=.99)
  self.assertIsNone(monte_carlo(p)['expectedShortfall'])
 def test_forecast_rolling_origins_and_predictive_outputs(self):
  p=dict(kind='probabilistic-forecast',asOf='2026-10-21',observations=rows(),horizon=5,target='price-return',unit='decimal',basis='price-only',seed=4)
  r=forecast(p);self.assertGreaterEqual(r['validation']['comparisons'][0]['origins'],20)
  self.assertTrue(r['available'],r.get('reason'))
  if r['available']:
   self.assertLessEqual(r['quantiles']['p10'],r['median']);self.assertLessEqual(r['median'],r['quantiles']['p90']);self.assertEqual(r,forecast(p))
 def test_current_vintage_cannot_create_historical_calibration(self):
  p=dict(asOf='2026-10-21',observations=[dict(r,availableAt='2026-10-21') for r in rows()],horizon=5,unit='decimal',basis='price-only')
  r=forecast(p);self.assertFalse(r['available']);self.assertEqual(r['validation']['comparisons'][0]['origins'],0)
 def test_future_edits_do_not_change_earlier_walk_forward_fits(self):
  p=dict(asOf='2026-10-21',observations=rows(),horizon=5,unit='decimal',basis='price-only');a=forecast(p)
  p['observations'][-1]['value']=.4;b=forecast(p)
  self.assertEqual(a['validation']['rollingOrigins'][:-1],b['validation']['rollingOrigins'][:-1])
 def test_wrong_target_history_and_growth_losses_are_rejected(self):
  with self.assertRaises(ValueError):forecast(dict(asOf='2026-10-21',observations=rows(),target='earnings-growth',basis='annual-reported',unit='KES'))
 def liq(self):
  return dict(kind='liquidity',symbol='A',status='active',asOf='2026-10-21',quantity=1000,participation=.1,observations=[dict(r,close=10,volume=100) for r in rows(120)])
 def test_liquidation_uses_participation_and_zero_days(self):
  p=self.liq();a=liquidity(p);self.assertEqual(a['windows'][0]['estimatedTradingSessions'],100)
  for r in p['observations'][-10:]:r['volume']=0
  self.assertEqual(liquidity(p)['windows'][0]['estimatedTradingSessions'],200)
 def test_missing_volume_and_suspensions_are_not_capacity(self):
  p=self.liq();p['status']='suspended';self.assertIsNone(liquidity(p)['windows'][0]['estimatedTradingSessions'])
  p=self.liq()
  for r in p['observations'][-10:]:r['volume']=None
  r=liquidity(p)['windows'][0];self.assertEqual(r['noTradeFraction'],0);self.assertIsNone(r['estimatedTradingSessions'])
 def test_graph_provenance_temporal_filter_cycles_and_explicit_propagation(self):
  edges=[dict(id=str(i),**{'from':a,'to':b},type='owns',ownershipPercent=30,sourceUrl=SOURCE,effectiveDate='2020-01-01',availableAt='2020-01-02',verification='verified') for i,(a,b) in enumerate([('A','B'),('B','C'),('C','A')])]
  p=dict(asOf='2026-10-21',edges=edges,start='A',end='C',propagation=dict(origin='A',shock=-.2,coefficients={'A->B':.5,'B->C':.5,'C->A':1}))
  r=graph(p);self.assertEqual(r['path'],['A','C']);self.assertEqual(len(r['propagation']),3);self.assertAlmostEqual(r['propagation'][-1]['assumedShock'],-.05)
  edges[0]['ownershipPercent']=101
  with self.assertRaises(ValueError):graph(p)
 def test_unverified_edges_do_not_become_facts(self):
  self.assertEqual(graph(dict(asOf='2026-10-21',edges=[dict(verification='pending')]))['edges'],[])
 def test_research_templates_link_sources_and_losses_have_no_pe_price(self):
  facts=[dict(id=str(i),category='financial-statements',label='Revenue',value=i+1,unit='KES',date=f'202{i}-12-31',availableAt=f'202{i+1}-03-01',sourceUrl=SOURCE) for i in range(2)]
  r=research_case(dict(asOf='2026-10-21',facts=facts,comparisons=[dict(current='1',previous='0')],scenarios=[dict(name='bear',revenue=100,growth=-.1,netMargin=-.2,shares=10,pe=10)]))
  self.assertEqual(r['summaries'][0]['evidenceIds'],['0','1']);self.assertIsNone(r['scenarios'][0]['price'])
 def test_relationship_extraction_is_always_review_only(self):
  p=dict(asOf='2026-10-21',availableAt='2024-03-01',sourceUrl=SOURCE,rows=[{'from':'A','to':'B','type':'owns','effectiveDate':'2023-12-31','ownershipPercent':25}])
  self.assertEqual(relationship_draft(p)['relationships'][0]['verification'],'pending')
 def test_model_hash_changes_with_inputs_but_not_wall_clock(self):
  p=self.liq();a=run(p);b=run(p);self.assertEqual(a['governance']['inputHash'],b['governance']['inputHash'])
  p['participation']=.2;self.assertNotEqual(a['governance']['inputHash'],run(p)['governance']['inputHash'])
  self.assertEqual(run_investment(p)['status'],200)

 def test_liquidity_caps_change_a_feasible_allocation_without_modifying_holdings(self):
  from institutional_intelligence import portfolio_liquidity
  assets=[dict(symbol=symbol,status='active',currency='KES',quantity=500,bars=[dict(row,close=10,volume=volume) for row in rows(120)],actions=[]) for symbol,volume in [('A',100),('B',2000)]]
  config=dict(kind='optimization',symbols=['A','B'],currentWeights=[.5,.5],covariance=[[.0001,0],[0,.0004]],observations=120,sectors={'A':'Banking','B':'Other'},objective='minimum-variance',turnoverCap=1)
  p=dict(asOf='2026-10-21',assets=assets,participation=.1,liquidationSessions=5,minimumTradingFrequency=.5,optimization=config)
  result=portfolio_liquidity(p)
  self.assertAlmostEqual(result['maximum']['A'],.05)
  self.assertLessEqual(result['optimizationComparison']['liquidityConstrained']['proposedWeights'][0],.0500001)
  self.assertGreater(result['optimizationComparison']['baseline']['proposedWeights'][0],.5)
  self.assertEqual(assets[0]['quantity'],500)
 def test_stale_liquidity_and_missing_owned_value_are_not_zero_filled(self):
  from institutional_intelligence import portfolio_liquidity
  p=self.liq();p['asOf']='2026-11-21';self.assertIsNone(liquidity(p)['windows'][0]['estimatedTradingSessions'])
  config=dict(asOf='2026-10-21',assets=[dict(symbol='A',currency='KES',status='active',quantity=10,bars=[],actions=[])])
  result=portfolio_liquidity(config);self.assertIsNone(result['datedPortfolioValue']);self.assertIsNone(result['maximum'])
 def test_positive_reference_price_uses_forecast_return_quantiles(self):
  p=dict(kind='probabilistic-forecast',asOf='2026-10-21',observations=rows(),horizon=5,target='price-return',unit='decimal',basis='price-only',seed=4,initialPrice=100,currency='KES')
  result=forecast(p);self.assertTrue(result['available'])
  self.assertAlmostEqual(result['priceScenarios']['quantiles']['p10'],100*(1+result['quantiles']['p10']))
 def test_forecast_audit_origins_are_separate_from_model_selection(self):
  p=dict(kind='probabilistic-forecast',asOf='2026-10-21',observations=rows(),horizon=5,target='price-return',unit='decimal',basis='price-only',seed=4)
  result=forecast(p)
  for model in result['validation']['comparisons']:
   self.assertEqual(model['auditOrigins'],20);self.assertIsNotNone(model['selectionMAE'])

 def test_factor_simulation_uses_a_separate_holdout_and_explicit_shocks(self):
  p=self.mc();p['method']='factor-bootstrap';p['factorHistory']={'factors':['market'],'observations':[dict(row,values={'market':row['values'][0]}) for row in p['returns']]}
  a=monte_carlo(p);self.assertEqual(a,monte_carlo(p));self.assertGreater(a['diagnostics']['factorModel']['holdoutObservations'],0)
  p['factorShocks']={'market':-.1};b=monte_carlo(p);self.assertLess(b['quantiles']['p50'],a['quantiles']['p50'])
 def test_factor_simulation_rejects_unmatched_or_unhelpful_factors(self):
  p=self.mc();p['method']='factor-bootstrap';p['factorHistory']={'factors':['market'],'observations':[]}
  with self.assertRaises(ValueError):monte_carlo(p)

 def test_dataset_hash_deduplicates_parameter_changes_not_changed_observations(self):
  p=self.mc();a=run(p);p['seed']+=1;b=run(p)
  self.assertEqual(a['governance']['dataHash'],b['governance']['dataHash']);self.assertNotEqual(a['governance']['inputHash'],b['governance']['inputHash'])
  p['returns'][0]['values'][0]+=.001;self.assertNotEqual(b['governance']['dataHash'],run(p)['governance']['dataHash'])
 def test_source_preparation_ignores_old_or_cancelled_actions_not_current_splits(self):
  from institutional_intelligence import prepare_market_inputs
  asset=dict(symbol='A',currency='KES',status='active',actions=[dict(type='split',effectiveDate='2000-01-01',status='completed')],bars=[dict(row,close=100+i*.01,volume=100) for i,row in enumerate(rows(200))])
  p=dict(asOf='2026-10-21',mode='forecast',assets=[asset],options={})
  self.assertEqual(prepare_market_inputs(p)['kind'],'probabilistic-forecast')
  asset['actions']=[dict(type='split',effectiveDate='2026-10-01',status='cancelled')];self.assertEqual(prepare_market_inputs(p)['kind'],'probabilistic-forecast')
  asset['actions'][0]['status']='completed'
  with self.assertRaises(ValueError):prepare_market_inputs(p)
 def test_unknown_holding_shocks_are_rejected_not_silently_ignored(self):
  p=self.mc();p['shocks']={'NOT-HELD':-.5}
  with self.assertRaises(ValueError):monte_carlo(p)

if __name__=='__main__':unittest.main()
