import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.readiness import research_readiness
from continua_engine.research_components import company_diagnostics
from continua_engine.reported import reported_research_ratios
from continua_engine.ratios import compute_ratios
from continua_engine.valuation_models import reported_eps


class CanonicalEvidenceTests(unittest.TestCase):
    def test_unknown_cash_or_debt_is_not_zero_enterprise_value(self):
        basis={'price':20,'sharesOutstanding':100,'ebitda':10,'cash':5}
        self.assertNotIn('evEbitda',compute_ratios(basis))
        basis['totalDebt']=0
        self.assertEqual(compute_ratios(basis)['evEbitda'],199.5)
        self.assertIsNone(reported_eps({'sharesOutstanding':100,'netIncome':None}))

    def observed(self):
        return {'fiscalYear':2024,'revenue':20.94e9,'netIncome':526.05e6,'eps':6.56,
                'basis':'publisher_observation','periodEnd':None,'reportedAt':None,
                'sourceUrls':['https://fixture.invalid/cgen'],'currency':None}

    def test_unknown_filing_date_preserves_observation_but_excludes_dated_valuation(self):
        row=self.observed()
        quote={'lastPrice':30,'timestamp':'2026-10-17T12:00:00Z','source':'live','currency':'KES'}
        result=research_readiness({'history':[row],'quote':quote,'unavailable':[],
            'technicalObservations':0,'estimateCount':0,'ownershipCount':0},'2026-10-18T12:00:00Z')
        self.assertTrue(result['matrix'][0]['observationAvailable'])
        self.assertFalse(result['matrix'][0]['usable'])
        capability={c['id']:c for c in result['capabilities']}
        self.assertEqual(capability['statements']['observed'],1)
        self.assertEqual(capability['dated-statements']['observed'],0)
        self.assertIsNone(reported_research_ratios('NSE:CGEN',quote,[row],None,'2026-10-18'))
        self.assertIn('filing-date-unavailable',[i['id'] for i in result['issues']])

    def test_evidence_detail_matches_underlying_observation(self):
        result=company_diagnostics([self.observed()],'Industrial')
        profit=next(c for c in result['checks'] if c['id']=='profit')
        self.assertEqual(profit['result'],'pass')
        self.assertEqual(profit['inputs']['netIncome'],526.05e6)
        self.assertEqual(profit['fiscalYear'],2024)
        evidence=next(e for e in result['evidence'] if e['field']=='netIncome')
        self.assertEqual(evidence['value'],profit['inputs']['netIncome'])
        self.assertEqual(evidence['basis'],'Third-party mapped observation')

    def test_financial_firms_do_not_receive_industrial_solvency_checks(self):
        for sector in ('Banking','Insurance','Financial services'):
            result=company_diagnostics([self.observed()],sector)
            for check in result['checks']:
                if check['id'] in ('cash','leverage','liquidity'):
                    self.assertEqual(check['result'],'not_applicable')
            self.assertEqual(result['knownChecks'],1)

    def test_missing_cash_is_not_zero_and_different_currency_is_not_growth_evidence(self):
        row=dict(self.observed(),currency='KES')
        prior=dict(row,fiscalYear=2023,currency='USD')
        result=company_diagnostics([prior,row])
        checks={c['id']:c for c in result['checks']}
        self.assertEqual(checks['cash']['result'],'unknown')
        self.assertIn('operatingCashFlow',checks['cash']['missing'])
        self.assertEqual(checks['margin']['result'],'unknown')


if __name__=='__main__':unittest.main()
