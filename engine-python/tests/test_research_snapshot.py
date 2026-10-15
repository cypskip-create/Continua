import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.research_snapshot import research_snapshot, technical_results


class SnapshotTests(unittest.TestCase):
    def test_persisted_pe_uses_same_eligible_filing_and_quote_as_bundle(self):
        quote = {'lastPrice': 90, 'timestamp': '2026-02-01T12:00:00.000Z', 'source': 'live'}
        history = [{'fiscalYear': 2024, 'periodEnd': '2024-12-31', 'reportedAt': '2025-03-01', 'eps': 6, 'sourceUrls': ['https://issuer.example/2024.pdf']},
                   {'fiscalYear': 2025, 'periodEnd': '2025-12-31', 'reportedAt': '2026-03-01', 'eps': 9, 'sourceUrls': ['https://issuer.example/2025.pdf']}]
        result = research_snapshot('NSE:KCB', quote, history, [], [], '2026-10-13T12:00:00.000Z')
        self.assertEqual(result['ratios']['pe'], 15)
        self.assertEqual(result['score']['inputs']['pe'], 15)
        self.assertEqual(result['ratios']['asOf'], quote['timestamp'])
        self.assertEqual(result['score']['asOf'], quote['timestamp'])

    def test_mock_future_and_unreviewed_inputs_do_not_persist_derived_values(self):
        row = {'fiscalYear': 2025, 'periodEnd': '2025-12-31', 'reportedAt': '2026-03-01', 'eps': 6}
        quote = {'lastPrice': 90, 'timestamp': '2026-10-12T12:00:00Z', 'source': 'live'}
        self.assertIsNone(research_snapshot('NSE:KCB', quote, [row], [], [], '2026-10-13'))
        for changed in [{'source': 'mock'}, {'timestamp': '2027-01-01T12:00:00Z'}]:
            self.assertIsNone(research_snapshot('NSE:KCB', {**quote, **changed}, [{**row, 'sourceUrls': ['https://issuer.example/a']}], [], [], '2026-10-13'))

    def test_missing_indicator_history_keeps_null_and_real_timestamps(self):
        self.assertEqual(technical_results('KCB', 'NSE', [], [{'type': 'SMA'}]), [None])
        bars = [{'timestamp': '2026-10-12', 'close': 90}]
        result = technical_results('KCB', 'NSE', bars, [{'type': 'SMA'}, {'type': 'MACD'}])
        self.assertIsNone(result[0]['latest'])
        self.assertEqual(result[1]['latest'], {'macd': None, 'signal': None, 'histogram': None})
        self.assertEqual(result[0]['timestamps'], ['2026-10-12'])
