import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'backend'/'python'))
from financial_extensions import financial_extensions,literal_number

class ExtensionTests(unittest.TestCase):
 def fixture(self):
  return dict(metadata=dict(currency='KES',scale=1000000,basis='consolidated',sourceUrl='https://issuer.example/annual',documentId='fixture',tableId='table-1',periods=[dict(periodEnd='2024-12-31',availableAt='2025-04-01')]),rows=[
   dict(label='Total assets',values=['1,000'],page=2),dict(label='Total liabilities',values=['600'],page=2),dict(label='Total equity',values=['400'],page=2),
   dict(label='Net interest income',values=['(20)'],page=3),dict(label='NPL ratio',values=['5%'],page=4),
   dict(label='Basic earnings per share',values=['2.50'],unit='currency_per_share',page=3)])
 def test_units_signs_industry_fields_and_accounting_identity(self):
  result=financial_extensions(self.fixture());values={r['field']:r['value'] for r in result['observations']}
  self.assertEqual(values['bankNetInterestIncome'],-20000000)
  self.assertEqual(values['bankNPLRatio'],.05)
  self.assertEqual(values['eps'],2.5)
  self.assertTrue(result['reconciliations'][0]['reconciled'])
  self.assertEqual(result['status'],'requires-review')
 def test_conflicts_are_preserved_not_selected(self):
  p=self.fixture();p['rows'].append(dict(label='Total assets',values=['2000'],page=7))
  result=financial_extensions(p)
  self.assertEqual(len(result['conflicts']),1)
  self.assertEqual(sum(r['field']=='totalAssets' for r in result['observations']),2)
  self.assertFalse(result['reconciliations'][0]['reconciled'])
 def test_ambiguous_units_footnotes_and_malformed_cells_remain_missing(self):
  for raw in ('1,23','12 note 4','--','( -20 )','3%'):
   self.assertIsNone(literal_number(raw))
  p=self.fixture();p['rows'][-1].pop('unit')
  self.assertIsNone(financial_extensions(p)['observations'][-1]['value'])
