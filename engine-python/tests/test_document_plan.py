import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from continua_engine.document_plan import publication_plan
from continua_engine.cbk import draft_bond_report
from test_publication import REPORT


class DocumentPlanTests(unittest.TestCase):
    def fixture(self):
        return {'method': 'native_pdf_text', 'needsReview': False, 'sourceId': 'nse', 'sourceUrl': 'https://www.nse.co.ke/example.pdf', 'text': REPORT, 'tables': [], 'config': {}, 'observedDate': '2026-10-11'}

    def test_exact_issuer_plan_and_conservative_units(self):
        result = publication_plan(self.fixture(), [{'id': 'NSE:EXAMPLE', 'company_id': 'example', 'name': 'Example Issuer PLC'}])
        self.assertTrue(result['valid'])
        self.assertEqual(len(result['entries']), 2)
        self.assertEqual(result['entries'][0]['confirmation']['periods'][0]['income']['eps'], 2.1)

    def test_ocr_review_source_scope_and_ambiguous_issuer(self):
        issuers = [{'id': 'NSE:EXAMPLE', 'name': 'Example Issuer PLC'}]
        for changes in [{'method': 'ocr'}, {'needsReview': True}, {'sourceUrl': 'https://example.org/report.pdf'}, {'sourceUrl': 'http://www.nse.co.ke/report.pdf'}, {'sourceUrl': 'https://user:secret@www.nse.co.ke/report.pdf'}]:
            row = {**self.fixture(), **changes}
            self.assertFalse(publication_plan(row, issuers)['valid'])
        self.assertFalse(publication_plan(self.fixture(), issuers * 2)['valid'])

    def test_bond_accepted_yield_not_market_yield_and_missing_columns(self):
        text = 'ISSUE NUMBER FXD3/2019/015 FXD1/2019/020\nISIN KE6000001328 KE5000009984\nDue Dates 10-Jul-34 21-Mar-39\nMarket Weighted Average Rate (%) 12.8740 13.8015\nWeighted Average Rate of Accepted Bids (%) 12.7338 13.6016\nPrice per Kshs 100 at average yield 100.6538 95.6773\nCoupon Rate (%) 12.3400 12.8730\n30 September 2026'
        records = draft_bond_report(text, 'https://www.centralbank.go.ke/results.pdf')
        self.assertEqual(records[0]['payload']['yield'], 12.7338)
        self.assertEqual(records[0]['observedAt'], '2026-09-30T00:00:00Z')
        with self.assertRaises(ValueError):
            draft_bond_report(text.replace('12.7338 13.6016', '12.7338'), 'https://www.centralbank.go.ke/results.pdf')
