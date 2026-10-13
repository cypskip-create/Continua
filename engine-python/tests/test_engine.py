import json
import pathlib
import subprocess
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine import indicators, ratios, valuation
from continua_engine.numbers import round4
from worker import execute

class EngineTests(unittest.TestCase):
    def test_missing_financials_are_not_zero(self):
        self.assertEqual(ratios.compute_ratios({"price":30}),{})
        self.assertNotIn("pe",ratios.compute_ratios({"price":30,"eps":0}))
    def test_annual_ratio_rejects_future_and_loss_denominators(self):
        rows=[{"fiscalYear":2025,"periodEnd":"2025-12-31","reportedAt":"2026-03-01","eps":3}]
        self.assertIsNone(valuation.annual_ratio_at(rows,30,"2026-02-28","pe")["ratio"])
        self.assertEqual(valuation.annual_ratio_at(rows,30,"2026-03-01","pe")["ratio"],10)
        rows[0]["eps"]=-3
        self.assertIsNone(valuation.annual_ratio_at(rows,30,"2026-03-01","pe")["ratio"])
    def test_js_rounding_not_bankers_rounding(self):
        self.assertEqual(round4(.00005),.0001)
        self.assertEqual(round4(-.00005),0)
    def test_warmup_and_invalid_periods(self):
        candles=[{"close":10},{"close":20}]
        self.assertEqual(indicators.sma(candles,3),[None,None])
        self.assertEqual(indicators.ema(candles,2),[None,15])
        with self.assertRaises(ValueError):indicators.sma(candles,0)
        with self.assertRaises(ValueError):indicators.sma([{"close":None}],2)
    def test_crossover_short_history(self):
        self.assertIsNone(indicators.latest_crossover([1,2],[1]))
        self.assertEqual(indicators.latest_crossover([1,3],[2,2]),"bullish")
    def test_unknown_operations_cannot_execute_code(self):
        with self.assertRaises(ValueError):execute("__import__",["os"])
    def test_existing_native_lab_is_reused(self):
        result=execute("earnings",[2,30,3,10,15])
        self.assertEqual(len(result["cells"]),9)
    def test_protocol_rejects_nonfinite_and_extra_fields(self):
        worker=str(pathlib.Path(__file__).resolve().parents[1]/"worker.py")
        for data in ['{"operation":"ratios","args":[{"price":NaN}]}',json.dumps({"operation":"ratios","args":[],"code":"not-allowed"})]:
            result=subprocess.run([sys.executable,worker],input=data,text=True,capture_output=True,timeout=5)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(result.stdout,"")

if __name__=="__main__":unittest.main()
