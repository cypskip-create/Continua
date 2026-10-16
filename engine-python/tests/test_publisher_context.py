import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.publisher_context import annotate_publisher_context

class ContextTests(unittest.TestCase):
 def test_exact_reported_fields_are_not_estimates_or_guessed_revenue(self):
  result=annotate_publisher_context({'charts':[{'label':label,'unit':'reported','points':[{'year':2024,'value':10,'raw':'10'}]} for label in ('Total Profit/Loss','Net Interest Income Total','Revenue')]})
  self.assertEqual([r['metric'] for r in result['financialFields']],['netIncome','revenue'])
  self.assertTrue(all(r['basis']=='publisher_observation' for r in result['financialFields']))
 def test_ownership_uses_percent_column_without_inventing_type_or_date(self):
  result=annotate_publisher_context({'destination':'ownership','tables':[{'columns':['Name','Shares ▼','Ownership %','Value (KES)'],'rows':[{'label':'Holder','numbers':[{'value':1e6,'approximate':True},{'value':64.56},{'value':30}]}]}]})
  self.assertEqual(result['ownership'][0]['percentHeld'],64.56)
  self.assertEqual(result['ownership'][0]['holderType'],'other')
  self.assertIsNone(result['ownership'][0]['asOf'])
