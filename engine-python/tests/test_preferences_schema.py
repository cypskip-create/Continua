import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.preferences import validate_preferences,record_interest,recommendations

class PreferenceSchemaTests(unittest.TestCase):
    def test_explicit_opt_in_default_off_and_unknown_fields_rejected(self):
        settings=validate_preferences({})["settings"]
        self.assertFalse(settings["learnInterests"])
        self.assertEqual(record_interest(settings,"KCB","NSE",now="2026-10-13T10:00:00Z")["interests"],[])
        for raw in ({"learnInterests":"true"},{"unknown":True},{"notifications":None}):
            self.assertFalse(validate_preferences(raw)["valid"])

    def test_string_lengths_dates_and_visit_bounds_are_strict(self):
        for raw in ({"sectors":["💜"*31]}, {"interests":[{"symbol":"kcb","exchange":"NSE","visits":1}]},
                    {"interests":[{"symbol":"KCB","exchange":"NSE","visits":True}]},
                    {"interests":[{"symbol":"KCB","exchange":"NSE","visits":10001}]},
                    {"interests":[{"symbol":"KCB","exchange":"NSE","visits":1,"lastSeen":"2026-10-13T10:00:00+03:00"}]}):
            self.assertFalse(validate_preferences(raw)["valid"])

    def test_daily_learning_opt_out_and_reset(self):
        settings=validate_preferences({"learnInterests":True})["settings"]
        once=record_interest(settings,"KCB","NSE",now="2026-10-13T10:00:00Z")
        twice=record_interest(once,"KCB","NSE",now="2026-10-13T12:00:00Z")
        self.assertEqual(twice["interests"][0]["visits"],1)
        disabled=dict(twice,learnInterests=False)
        self.assertEqual(recommendations(disabled,"2026-10-13T14:00:00Z")["companies"],[])
        self.assertEqual(record_interest(disabled,"KCB","NSE",True,"2026-10-13T14:00:00Z")["interests"],[])

if __name__=="__main__":unittest.main()
