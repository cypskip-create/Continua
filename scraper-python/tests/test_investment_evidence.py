import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.investment import worldbank_observations

class MacroParserTests(unittest.TestCase):
 def response(self,value=4):
  return [{'pages':1,'lastupdated':'2026-10-01'},[{'countryiso3code':'KEN','indicator':{'id':'NY.GDP.MKTP.KD.ZG'},'date':'2024','value':value}]]
 def test_first_seen_vintage_not_backdated(self):
  row=worldbank_observations(self.response(),'2026-10-21')[0]
  self.assertEqual(row['date'],'2024-12-31')
  self.assertEqual(row['availableAt'],'2026-10-21')
  self.assertEqual(row['payload']['unit'],'percent')
 def test_missing_is_not_zero(self):
  self.assertEqual(worldbank_observations(self.response(None),'2026-10-21'),[])
  self.assertEqual(worldbank_observations(self.response(0),'2026-10-21')[0]['payload']['value'],0)
 def test_partial_pages_and_wrong_country_are_rejected(self):
  data=self.response();data[0]['pages']=2
  with self.assertRaises(ValueError):worldbank_observations(data,'2026-10-21')
  data=self.response();data[1][0]['countryiso3code']='USA'
  with self.assertRaises(ValueError):worldbank_observations(data,'2026-10-21')
