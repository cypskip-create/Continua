import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.filing_draft import filing_draft, parse_number
from continua_engine.news import announcement_ingestion_input


class FilingDraftTests(unittest.TestCase):
    def test_duplicates_are_ambiguous_and_comparatives_retained(self):
        draft = filing_draft({'documentTitle': '2024 annual filing', 'detectedTable': {'rows': [
            {'label': 'Revenue', 'values': ['1,000', '(200)']},
            {'label': 'Group revenue', 'values': ['3,000', '400']},
            {'label': 'Earnings per share', 'values': ['2.5', '—']}]}})
        self.assertEqual(draft['fiscalYear'], 2024)
        self.assertEqual(draft['mapped'], {'revenue': None, 'eps': 2.5})
        self.assertEqual(len(draft['historicalColumns']), 2)
        self.assertIsNone(draft['historicalColumns'][1]['mapped']['eps'])
        self.assertNotIn('unitsVerified', draft)

    def test_finite_and_missing_draft_values(self):
        for text in ('Infinity', '1e999', '—', '', None):
            self.assertIsNone(parse_number(text))
        self.assertEqual(parse_number('(1,234.5)'), -1234.5)
        self.assertEqual(parse_number('1.5 B'), 1.5)  # Review-only, no inferred units.

    def test_announcements_preserve_missing_dates_and_ambiguous_identity(self):
        row = {'extractionId': 2, 'artifactId': 1, 'title': 'Unrelated filing', 'documentUrl': 'https://fixture.example/a',
               'sourceId': 'fixture', 'text': 'Literal source prose', 'entity': {}, 'needsReview': True}
        result = announcement_ingestion_input(row, [])
        self.assertIsNone(result['securityId'])
        self.assertIsNone(result['publishedAt'])
        self.assertTrue(result['needsReview'])
