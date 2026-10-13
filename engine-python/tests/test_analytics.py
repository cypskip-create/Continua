import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.analytics import analyze_financials,data_quality,scenarios

class AnalyticsTests(unittest.TestCase):
    def test_sparse_years_are_not_growth(self):
        rows=[{"fiscalYear":2021,"revenue":10},{"fiscalYear":2025,"revenue":20}]
        self.assertIsNone(analyze_financials(rows,"Banking")["metrics"]["revenueGrowth"])
        self.assertEqual(data_quality(None,rows,"2026-10-13T12:00:00Z")["financialCoverage"]["missingYears"],[2022,2023,2024])

    def test_nonpositive_denominator_missing_and_future_dates(self):
        row={"fiscalYear":2025,"revenue":0,"netIncome":-10,"operatingCashFlow":2,"reportedAt":"2027-01-01","totalEquity":0,"totalDebt":10}
        result=analyze_financials([row],"Industrial")
        self.assertIsNone(result["metrics"]["debtToEquity"])
        self.assertIsNone(result["metrics"]["cashConversion"])
        self.assertIsNone(scenarios(row)[0]["netIncome"])
        self.assertIn("FY2025: filing date is in the future.",data_quality(None,[row],"2026-10-13T12:00:00Z")["warnings"])
        self.assertEqual(data_quality(None,[],"2026-10-13T12:00:00Z")["warnings"],["Annual financial coverage is missing."])

if __name__=="__main__":unittest.main()
