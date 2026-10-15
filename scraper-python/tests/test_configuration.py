import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.config import boolean

class ConfigurationTests(unittest.TestCase):
    def test_runtime_flags_fail_closed_on_typographical_errors(self):
        for value in ('true','TRUE','1','yes'):self.assertTrue(boolean(value))
        for value in ('false','FALSE','0','no'):self.assertFalse(boolean(value))
        self.assertFalse(boolean(None))
        self.assertTrue(boolean('',True))
        for value in ('enabled',' true','false ','2',True,1):
            with self.assertRaises(ValueError):boolean(value)
