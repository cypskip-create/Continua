import unittest
from continua_engine.calculated_answer import calculated_answer,assistant_answer
class AnswerTests(unittest.TestCase):
    def test_no_evidence_cannot_produce_answer(self):
        with self.assertRaises(ValueError):calculated_answer('revenue',[])
    def test_missing_metrics_stay_missing_and_citations_are_known(self):
        evidence=[{'id':'KCB:company','title':'Issuer','asOf':None,'facts':{'financial':{'period':2025,'metrics':{'revenueGrowth':None}}}}]
        result=calculated_answer('revenue',evidence)
        self.assertIn('Unavailable',result['answer']);self.assertEqual(result['citations'],['KCB:company']);self.assertEqual(result['sources'],evidence);self.assertFalse(result['cached'])
    def test_company_input_order_is_preserved(self):
        companies=[{'symbol':'KCB','bundle':{'companyName':'KCB','news':[]}},{'symbol':'ABSA','bundle':{'companyName':'ABSA','news':[]}}]
        result=assistant_answer('revenue',companies,None,'2026-10-14T12:00:00Z')
        self.assertEqual(result['citations'],['KCB:company','ABSA:company'])
