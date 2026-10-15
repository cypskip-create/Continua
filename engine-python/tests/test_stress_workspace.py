import unittest
from continua_engine.labs import stress_workspace

class StressWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.now='2026-10-14T12:00:00Z'
        self.p=[{'symbol':'KCB','price':40,'shares':10,'cost':300,'change':1,'volume':100,'sector':'Banking','currency':'KES','asOf':'2026-10-14T09:00:00Z'}]
    def test_literal_owned_values_and_compounded_shocks(self):
        result=stress_workspace({'marketShock':-.1,'sectorShocks':{'Banking':-.2}},self.p,self.now)
        self.assertEqual(result['status'],200)
        self.assertAlmostEqual(result['data']['stressedValue'],288)
        self.assertEqual(result['data']['datedQuoteCoverage'],'1/1')
    def test_no_future_or_unpriced_positions(self):
        for patch in [{'asOf':'2026-10-15T09:00:00Z'},{'price':None}]:
            self.assertEqual(stress_workspace({'marketShock':-.1},[{**self.p[0],**patch}],self.now)['status'],422)
    def test_strict_schema_and_known_sectors(self):
        for raw in [{'marketShock':True},{'marketShock':-.1,'extra':0},{'marketShock':-.1,'sectorShocks':{'Imaginary':-.2}},{'marketShock':float('nan')}]:
            self.assertEqual(stress_workspace(raw,self.p,self.now)['status'],400)
