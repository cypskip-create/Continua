import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.company_context import company_context

def view(category,**values):
 return {'destination':'financials','category':category,'status':'publisher_observation','financialFields':[{'year':2024,'metric':k,'value':v} for k,v in values.items()]}

class CompanyTests(unittest.TestCase):
 def test_matching_year_assembly_and_decimal_ratios(self):
  r=company_context([view('Profit/Loss',netIncome=20,revenue=100),view('Assets',totalAssets=500),view('Equity',totalEquity=200)])
  self.assertEqual(r['latest']['ratios']['netMargin'],.2)
  self.assertEqual(r['latest']['ratios']['roe'],.1)
  self.assertIsNone(r['latest']['ratios']['debtToEquity'])
  self.assertNotIn('reportedAt',r['latest'])
 def test_conflicts_and_negative_denominators_are_not_ratios(self):
  r=company_context([view('Profit/Loss',netIncome=20,revenue=100),view('Other',netIncome=10),view('Equity',totalEquity=-2)])
  self.assertIsNone(r['latest']['ratios']['roe'])
  self.assertIsNone(r['latest']['netIncome'])
 def test_summary_rounding_does_not_erase_statement(self):
  summary=view(None,revenue=101);summary['destination']='overview'
  r=company_context([summary,view('Profit/Loss',revenue=100),view('Profit/Loss',revenue=99)])
  self.assertEqual(r['latest']['revenue'],100)
