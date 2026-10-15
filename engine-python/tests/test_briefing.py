import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from continua_engine.briefing import company_briefing, research_synthesis, fixed1


class BriefingTests(unittest.TestCase):
    def test_missing_and_nonconsecutive_periods_do_not_create_growth(self):
        for prior in [None, {'fiscalYear': 2021, 'revenue': 10}]:
            result = company_briefing({'symbol': 'KCB', 'latest': {'fiscalYear': 2025, 'revenue': 100}, 'prior': prior, 'ratios': {}})
            self.assertEqual(result['facts'], [])

    def test_negative_earnings_growth_and_loss_are_separate(self):
        result = company_briefing({'symbol': 'KCB', 'latest': {'fiscalYear': 2025, 'netIncome': -5}, 'prior': {'fiscalYear': 2024, 'netIncome': -10}})
        self.assertEqual(len(result['strengths']), 1)
        self.assertEqual(result['risks'], ['The latest annual period records a net loss.'])
        self.assertEqual(fixed1(1.25), '1.3')
        self.assertEqual(fixed1(-1.25), '-1.3')

    def test_missing_signals_are_not_zero_or_trade_advice(self):
        result = research_synthesis(None, [{'type': 'RSI', 'latest': None, 'timestamps': []}], [], ['Quote'])
        self.assertEqual(result['observations'], [])
        self.assertEqual(len(result['checklist']), 1)
        self.assertIn('not trade recommendations', result['methodology'])
