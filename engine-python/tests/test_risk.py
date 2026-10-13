import sys
import pathlib
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.risk import portfolio_overview,portfolio_risk,risk_contributions,total_return_series

class RiskTests(unittest.TestCase):
    def test_risk_requires_observed_coverage(self):
        self.assertFalse(portfolio_risk({}, {})["available"])
        self.assertIsNone(risk_contributions({"A":[0]*60},{"A":1}))
        self.assertIsNone(risk_contributions({"A":[.01]*20,"B":[.02]*19},{"A":.5,"B":.5}))

    def test_overview_stale_and_mixed_currency(self):
        p={"symbol":"A","shares":10,"price":20,"cost":150,"change":1,"volume":1000,"sector":"Banking","currency":"KES","asOf":"2026-10-01T12:00:00.000Z"}
        result=portfolio_overview([p],"NSE","2026-10-13T12:00:00.000Z")
        self.assertEqual(result["unrealized"],50)
        self.assertIsNone(result["sessionPnl"])
        self.assertIn("stale",result["warnings"][-1])
        mixed=portfolio_overview([p,dict(p,currency="USD")],"NSE","2026-10-13T12:00:00.000Z")
        self.assertFalse(mixed["available"])
        self.assertIsNone(mixed["unrealized"])
        self.assertEqual(portfolio_overview([],"NSE","2026-10-13T12:00:00.000Z")["holdingCount"],0)

    def test_actions_reject_guessing_and_invalid_dates(self):
        bars=[{"date":"2026-01-01","close":100},{"date":"2026-01-03","close":102}]
        invalid=[
            [{"date":"2026-01-02","dividend":1,"sourceUrl":"https://fixture.example/a"}],
            [{"date":"2026-01-03","dividend":1,"sourceUrl":"http://fixture.example/a"}],
            [{"date":"2026-02-30","dividend":1,"sourceUrl":"https://fixture.example/a"}],
            [{"date":"2026-01-03","splitRatio":2,"dividend":1,"sourceUrl":"https://fixture.example/a"}],
            [{"date":"2026-01-03","dividend":1,"sourceUrl":"https://fixture.example/a"}]*2,
        ]
        for actions in invalid:
            with self.assertRaises(ValueError):total_return_series(bars,actions)
        with self.assertRaises(ValueError):total_return_series(bars+bars,[])

    def test_actual_action_adjustment(self):
        output=total_return_series([{"date":"2026-01-01","close":100},{"date":"2026-01-02","close":51}],[{"date":"2026-01-02","splitRatio":2,"sourceUrl":"https://fixture.example/a"}])
        self.assertEqual(output[-1]["index"],102)

if __name__=="__main__":unittest.main()
