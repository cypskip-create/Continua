import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.analytics import analyze_financials
from continua_engine.briefing import company_briefing
from continua_engine.reported import reported_research_ratios
from continua_engine.research_snapshot import research_snapshot
from continua_engine.valuation import valuation_history
from continua_engine.readiness import research_readiness


class CurrencyBasisTests(unittest.TestCase):
    def test_explicit_currency_mismatch_cannot_produce_price_ratios(self):
        quote={'lastPrice':30,'timestamp':'2026-10-12T12:00:00Z','currency':'KES','source':'live'}
        row={'fiscalYear':2025,'reportedAt':'2026-03-01','periodEnd':'2025-12-31','eps':6,'currency':'RWF','sourceUrls':['https://issuer.example/a.pdf']}
        self.assertIsNone(reported_research_ratios('NSE:BKG',quote,[row],None,'2026-10-13'))
        self.assertIsNone(research_snapshot('NSE:BKG',quote,[row],[],[],'2026-10-13'))
        self.assertIsNone(valuation_history('BKG',[row],quote,[],'pe')['current']['ratio'])
        result=research_readiness({'quote':quote,'history':[row],'unavailable':[],'technicalObservations':100,'estimateCount':0,'ownershipCount':0},'2026-10-13')
        self.assertIn('currency-basis',[i['id'] for i in result['issues']])

    def test_growth_does_not_bridge_different_currency_bases(self):
        prior={'fiscalYear':2024,'currency':'USD','revenue':100,'netIncome':20}
        latest={'fiscalYear':2025,'currency':'KES','revenue':12000,'netIncome':2400}
        self.assertIsNone(analyze_financials([prior,latest],'Banking')['metrics']['revenueGrowth'])
        self.assertEqual(company_briefing({'symbol':'BKG','latest':latest,'prior':prior,'ratios':{}})['facts'],[])
