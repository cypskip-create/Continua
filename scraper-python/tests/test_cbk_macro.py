import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.cbk_macro import cbk_observations

class CBKTests(unittest.TestCase):
 def test_literal_policy_auction_and_monthly_dates(self):
  html='<table><tr><td>Central Bank Rate</td><td>9.00%</td><td>01/09/2025</td></tr><tr><td>91-Day T-Bill</td><td>8.1%</td><td>12/09/2025</td></tr><tr><td>Inflation Rate</td><td>5.2%</td><td>August,2025</td></tr></table>'
  rows=cbk_observations(html,'https://www.centralbank.go.ke/monetary-policy/','2025-10-01')
  self.assertEqual(rows[0]['date'],'2025-09-01');self.assertEqual(rows[0]['availableAt'],'2025-10-01')
  self.assertEqual(rows[1]['payload']['yieldBasis'],'accepted_auction')
  self.assertEqual(rows[2]['date'],'2025-08-31')
 def test_no_date_or_unit_guessing_on_conflicting_rows(self):
  html='<table><tr><td>Central Bank Rate</td><td>9%</td><td>01/09/2025</td></tr><tr><td>Central Bank Rate</td><td>10%</td><td>01/09/2025</td></tr></table>'
  with self.assertRaises(ValueError):cbk_observations(html,'https://www.centralbank.go.ke/','2025-10-01')
  self.assertEqual(cbk_observations(html,'https://mirror.invalid/','2025-10-01'),[])
