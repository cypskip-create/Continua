import pathlib
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.afx_quote import quote_candidate,literal_number
from continua_scraper.afx import AfxAdapter
from continua_scraper.html import soup

PAGE='''<title>CGEN - Car &amp; General</title><p>The current share price of Car &amp; General is KES 21.00, recording a drop from its previous closing price of 22.00 KES. It closed its last trading day (Wednesday, October 14, 2026).</p><table><tr><td>Opening Price</td><td>—</td></tr><tr><td>Day's High Price</td><td></td></tr><tr><td>Day's Low Price</td><td></td></tr><tr><td>Traded Volume</td><td>1,000</td></tr></table>'''

class AfxQuoteTests(unittest.TestCase):
    def test_missing_range_is_not_backfilled_and_date_is_source_date(self):
        value=quote_candidate(PAGE,'CGEN','2026-10-15')
        self.assertEqual(value['lastPrice'],21);self.assertEqual(value['change'],-1);self.assertEqual(value['changePercent'],-4.55)
        self.assertEqual(value['volume'],1000);self.assertEqual(value['tradingDate'],'2026-10-14')
        for key in ('open','high','low'):self.assertIsNone(value[key])
        self.assertNotIn('timestamp',value);self.assertNotIn('status',value)
    def test_rounded_volume_unknown_date_and_related_issuer_do_not_fabricate(self):
        self.assertIsNone(quote_candidate(PAGE.replace('1,000','1K'),'CGEN','2026-10-15')['volume'])
        self.assertIsNone(quote_candidate(PAGE,'KCB','2026-10-15'))
        self.assertIsNone(quote_candidate(PAGE.replace('current share price of Car &amp; General','current share price of Other Company'),'CGEN','2026-10-15'))
        self.assertIsNone(quote_candidate(PAGE,'CGEN','2026-10-13'))
        self.assertIsNone(quote_candidate(PAGE.replace('Wednesday, October 14, 2026','unknown'),'CGEN','2026-10-15'))
        self.assertIsNone(quote_candidate(PAGE.replace('KES 21.00','KES 1,,000'),'CGEN','2026-10-15'))
    def test_number_parser_rejects_ambiguous_or_nonliteral_values(self):
        for raw in ('1,,000','approx 20','NaN','1K','KES 20 USD','—',None):self.assertIsNone(literal_number(raw))
        self.assertEqual(literal_number('KES 1,234.50'),1234.5)
    def test_unrelated_paragraph_cannot_supply_previous_close(self):
        html=PAGE.replace('from its previous closing price of 22.00 KES','')+'<p>Other company previous closing price of 100 KES.</p>'
        result=quote_candidate(html,'CGEN','2026-10-15')
        self.assertIsNone(result['previousClose']);self.assertIsNone(result['change']);self.assertIsNone(result['changePercent'])

class AfxAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_profile_quote_and_history_reuse_one_bounded_dom(self):
        class IO:
            source={'id':'afx-fixture'}
            def text(self,artifact):return PAGE
        adapter=AfxAdapter(IO())
        with patch('continua_scraper.afx.soup',wraps=soup) as parsed,patch('continua_scraper.html.soup',side_effect=AssertionError('duplicate DOM')),patch('continua_scraper.afx_quote.soup',side_effect=AssertionError('duplicate DOM')):
            result=await adapter.parse({'artifact':object(),'document':{'context':{'ticker':'CGEN'}}})
        self.assertEqual(parsed.call_count,1)
        self.assertTrue(result['needsReview']);self.assertEqual(result['entity']['ticker'],'CGEN')
        self.assertEqual(result['tables'][0]['kind'],'afx_quote_candidate')
