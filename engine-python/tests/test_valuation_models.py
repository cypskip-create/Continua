import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.valuation_models import relative_valuation, graham_number, dividend_discount


class ValuationTests(unittest.TestCase):
    def test_insufficient_peers_and_missing_book_values_are_explained(self):
        result = relative_valuation(30, {'fiscalYear': 2025, 'eps': 6}, 'banking', {'avgPe': 7.73, 'sampleSize': 2})
        self.assertIsNone(result['fairValue'])
        self.assertIn('Fewer than 3', result['unavailableReason'])
        self.assertIsNone(graham_number(30, {'eps': 6})['fairValue'])

    def test_two_real_dividend_windows_required(self):
        payouts = [{'exDate': '2026-05-01', 'announcedAt': '2026-03-01', 'status': 'confirmed', 'details': {'type': 'dividend', 'amountPerShare': 2}}]
        self.assertIsNone(dividend_discount(30, payouts, '2026-10-13')['fairValue'])
        payouts.append({'exDate': '2025-05-01', 'announcedAt': '2025-03-01', 'status': 'confirmed', 'details': {'type': 'dividend', 'amountPerShare': 1.8}})
        result = dividend_discount(30, payouts, '2026-10-13')
        self.assertIsNotNone(result['fairValue'])
        self.assertEqual(result['inputs']['assumedRequiredReturnPercent'], 12)
