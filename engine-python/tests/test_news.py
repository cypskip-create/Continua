import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.news import analyze_news_issuers, is_financial_news, dedupe_news, news_impact


class NewsTests(unittest.TestCase):
    def directory(self):
        return [{'symbol': 'SCOM', 'companyName': 'Safaricom PLC', 'securityId': 'NSE:SCOM'}, {'symbol': 'KCB', 'companyName': 'KCB Group PLC', 'securityId': 'NSE:KCB'}]

    def test_price_rail_and_related_stories_are_not_issuer_evidence(self):
        raw = 'Neutral headline\nSCOM KES 30.00 KCB KES 90.00 share prices market watch.\nThe company explained its ongoing operations to customers.\nRelated stories\nSafaricom disclosed a higher profit in the prior year.'
        self.assertEqual(analyze_news_issuers('Neutral headline', raw, self.directory()), [])

    def test_brand_is_linked_to_canonical_issuer_without_forecast(self):
        matches = analyze_news_issuers('M-Pesa expands services', '', self.directory())
        self.assertEqual(matches[0]['securityId'], 'NSE:SCOM')
        self.assertEqual(matches[0]['relationship'], 'brand')
        self.assertIn('not a directional price prediction', news_impact('M-Pesa expands services', None, ['SCOM'])['methodology'])

    def test_crime_is_not_financial_news_just_because_bank_is_named(self):
        self.assertFalse(is_financial_news('KCB staff injured in road accident', 'An incident occurred.', True))
        self.assertTrue(is_financial_news('Bank profit declined after fraud investigation', '', True))

    def test_deduplication_does_not_union_unverified_legacy_tags(self):
        rows = [{'headline': 'Bank annual profit', 'articleUrl': 'https://publisher.example/a?track=1', 'excerpt': 'Short', 'symbols': ['WRONG'], 'securityIds': ['NSE:WRONG']},
                {'headline': 'Bank annual profit!', 'articleUrl': 'https://publisher.example/a', 'content': 'A substantially longer verified source receipt.', 'symbols': ['KCB'], 'securityIds': ['NSE:KCB']}]
        result = dedupe_news(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['symbols'], ['KCB'])
