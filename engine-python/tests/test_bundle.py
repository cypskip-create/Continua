import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.bundle import assemble_company_bundle


class BundleTests(unittest.TestCase):
    def fixture(self):
        return {'profile': {'id': 'NSE:KCB', 'currency': 'KES', 'company': {'name': 'KCB Group PLC', 'sectorName': 'Banking'}}, 'symbol': 'KCB', 'exchange': 'NSE',
                'quote': {'lastPrice': 90, 'timestamp': '2026-10-12T12:00:00.000Z', 'source': 'live'},
                'history': [{'fiscalYear': 2024, 'periodEnd': '2024-12-31', 'reportedAt': '2025-03-01', 'eps': 6, 'revenue': 100, 'netIncome': 20, 'sourceUrls': ['https://issuer.example/a.pdf']},
                            {'fiscalYear': 2025, 'periodEnd': '2025-12-31', 'reportedAt': '2026-03-01', 'eps': 9, 'revenue': 120, 'netIncome': 25, 'sourceUrls': ['https://issuer.example/b.pdf']}],
                'news': [], 'actions': [], 'ownership': [], 'earnings': [], 'technicals': [], 'unavailable': []}

    def test_same_dated_ratio_is_used_for_briefing_and_score(self):
        result = assemble_company_bundle(self.fixture(), '2026-10-13T12:00:00.000Z')
        bundle = result['bundle']
        self.assertEqual(bundle['ratios']['pe'], 10)
        self.assertEqual(bundle['score']['inputs']['pe'], 10)
        self.assertTrue(result['observeEligible'])
        self.assertEqual(bundle['generatedAt'], '2026-10-13T12:00:00.000Z')

    def test_partial_and_missing_financials_never_record_false_baseline(self):
        input = self.fixture(); input['history'] = []; input['unavailable'] = ['Financial statements']
        result = assemble_company_bundle(input, '2026-10-13T12:00:00.000Z')
        self.assertFalse(result['observeEligible'])
        self.assertIsNone(result['bundle']['ratios'])
        self.assertIsNone(result['bundle']['score'])
        self.assertEqual(result['bundle']['reliability']['status'], 'incomplete')

    def test_future_filing_cannot_drive_current_quote_valuation(self):
        input = self.fixture(); input['history'][-1]['reportedAt'] = '2027-03-01'
        result = assemble_company_bundle(input, '2026-10-13T12:00:00.000Z')
        self.assertEqual(result['bundle']['ratios']['pe'], 15)
        self.assertIn('provenance', [i['id'] for i in result['bundle']['reliability']['issues']])
