import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.readiness import research_readiness
from continua_engine.analytics import fingerprint, changes_between
from continua_engine.research_components import company_diagnostics, summarize_news


class ResearchEvidenceTests(unittest.TestCase):
    def input(self):
        return {'quote': {'lastPrice': 90, 'timestamp': '2026-10-09T12:00:00Z', 'source': 'live'}, 'history': [{'fiscalYear': 2025, 'periodEnd': '2025-12-31', 'reportedAt': '2026-03-01', 'revenue': 0, 'sourceUrls': ['https://issuer.example/report.pdf']}], 'unavailable': [], 'technicalObservations': 100, 'estimateCount': 1, 'ownershipCount': 2}

    def test_identity_is_evidence_based_not_retrieval_time(self):
        input = self.input()
        first = research_readiness(input, '2026-10-11T12:00:00Z')
        second = research_readiness(input, '2026-10-12T12:00:00Z')
        self.assertEqual(first['snapshotId'], second['snapshotId'])
        self.assertTrue(first['matrix'][0]['fields']['revenue'])
        self.assertFalse(first['matrix'][0]['fields']['eps'])
        input['quote']['lastPrice'] = 91
        self.assertNotEqual(first['snapshotId'], research_readiness(input, '2026-10-12')['snapshotId'])

    def test_no_source_and_mock_quote_are_blocked_not_zero(self):
        input = self.input(); input['history'][0]['sourceUrls'] = []; input['quote']['source'] = 'mock'
        result = research_readiness(input, '2026-10-12')
        self.assertEqual(result['status'], 'incomplete')
        self.assertFalse(result['matrix'][0]['usable'])
        self.assertIn('quote-unusable', [i['id'] for i in result['issues']])

    def test_wire_hash_number_and_key_semantics(self):
        self.assertEqual(fingerprint({'value': 1}), fingerprint({'value': 1.0}))
        self.assertEqual(fingerprint({'value': -0.0}), fingerprint({'value': 0}))
        self.assertEqual(fingerprint({'20': 20, '2': 2}), fingerprint({'2': 2, '20': 20}))
        self.assertNotEqual(fingerprint({'a': None}), fingerprint({}))

    def test_missing_news_and_disclosures_do_not_create_changes(self):
        state = {'newsIds': [], 'ownership': []}
        self.assertEqual(changes_between(state, state), {'baseline': False, 'changes': []})
        self.assertEqual(company_diagnostics([])['knownChecks'], 0)
        self.assertIn('did not', summarize_news('Headline', 'The company did not grow its earnings in this reporting period.')['summary'])
