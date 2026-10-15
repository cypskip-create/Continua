import unittest
from continua_engine.portfolio_workspace import snapshot_plan,portfolio_workspace

class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.now='2026-10-14T12:00:00Z'
        self.positions=[{'symbol':'KCB','price':40,'shares':10,'cost':300,'change':1,'volume':100,'sector':'Banking','currency':'KES','asOf':'2026-10-14T09:00:00Z'}]
    def test_snapshot_never_uses_partial_future_or_mixed_session(self):
        self.assertTrue(snapshot_plan(self.positions,self.now)['complete'])
        for p in [{'price':None},{'asOf':'2026-10-15T09:00:00Z'},{'asOf':'2026-10-01T09:00:00Z'},{'currency':'unknown'}]:
            self.assertFalse(snapshot_plan([{**self.positions[0],**p}],self.now)['complete'])
        self.assertFalse(snapshot_plan([*self.positions,{**self.positions[0],'symbol':'ABSA','asOf':'2026-10-13T09:00:00Z'}],self.now)['complete'])
    def test_storage_outage_withholds_returns_not_holdings(self):
        result=portfolio_workspace({'positions':self.positions,'persistenceAvailable':False},self.now)
        self.assertEqual(result['totalValue'],400)
        self.assertIsNone(result['performance']['twr'])
        self.assertEqual(result['researchBriefing']['companies'][0]['unavailable'],['Company research'])
    def test_flows_across_gaps_and_company_evidence(self):
        data={'positions':self.positions,'persistenceAvailable':True,'snapshots':[{'date':'2026-10-01','value':100,'flow':0},{'date':'2026-10-14','value':150,'flow':0}],'periodFlows':[{'date':'2026-10-05','amount':25}], 'companies':{'KCB':{'financialAnalysis':{'period':2025,'metrics':{'revenue':50}},'briefing':{'facts':['Observed filing']},'news':[]}},'histories':[{'symbol':'KCB','bars':[],'blocked':True}]}
        result=portfolio_workspace(data,self.now)
        self.assertEqual(result['snapshots'][1]['flow'],25)
        self.assertEqual(result['performance']['twr'],25)
        self.assertEqual(result['researchBriefing']['covered'],1)
        self.assertEqual(result['researchBriefing']['companies'][0]['period'],2025)
        self.assertIn('corporate-action',result['historyWarnings'][0])
