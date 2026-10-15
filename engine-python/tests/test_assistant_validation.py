import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.calculated_answer import validate_assistant_answer

class AssistantValidationTests(unittest.TestCase):
    def test_only_server_supplied_sources_can_be_returned(self):
        evidence=[{'id':'issuer:company','facts':{'revenue':None}}]
        value={'answer':'Revenue is unavailable.','citations':['issuer:company'],'limitations':['Not a forecast']}
        self.assertEqual(validate_assistant_answer(value,evidence)['sources'],evidence)
        for invalid in ({**value,'citations':['invented']},{**value,'citations':[]},{**value,'answer':''},{**value,'extra':True},{**value,'limitations':[True]},{**value,'answer':'x'*12001}):
            with self.assertRaises(ValueError):validate_assistant_answer(invalid,evidence)
