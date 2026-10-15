import json
import pathlib
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.mystocks import parse_quote,chart_closes,MyStocksHistoryAdapter
from continua_scraper.download import Downloader
from continua_scraper.policy import SourcePolicy

class MyStocksTests(unittest.TestCase):
    def test_direction_uses_literal_prices_not_unsigned_source_text(self):
        raw={'stamp':1791954000,'data':['37.60','0.25 (0.66%)','37.85','37.60','37.70','37.95','37.50','516,703']}
        quote=parse_quote(raw,'COOP',1800000000)
        self.assertEqual(quote['change'],-.25);self.assertEqual(quote['changePercent'],-.66);self.assertEqual(quote['volume'],516703)
        self.assertNotIn('status',quote)
    def test_missing_volume_future_stamp_and_bad_range_are_not_fabricated(self):
        raw={'stamp':1000,'data':['10','','11','','10','11','9','100']}
        for altered in [{**raw,'stamp':2000},{**raw,'data':raw['data'][:7]},{**raw,'data':raw['data'][:7]+['unknown']},{**raw,'data':['10','','11','','10','8','9','100']}]:
            self.assertIsNone(parse_quote(altered,'KCB',1500))
    def test_history_is_close_only_never_fake_ohlc_or_zero_volume(self):
        seconds=(719162+20000)*86400
        model={'charts':[{'axes':[{'labels':{'0':['date',seconds]}}],'layers':[{'id':0,'dataSets':[{'data':[40]}]}]}]}
        html='<div id="myStocksChart_JS">'+json.dumps(model)+'</div>'
        rows=chart_closes(html,'2020-01-01T00:00:00.000Z','2026-10-14T23:59:59.999Z','2026-10-14T23:59:59.999Z')
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['close'],40);self.assertIsNone(rows[0]['volume']);self.assertNotIn('open',rows[0]);self.assertNotIn('high',rows[0]);self.assertNotIn('low',rows[0])
    def test_rounded_publisher_volume_is_not_claimed_as_exact(self):
        raw={'stamp':1791980710,'data':['85.50','3.00 (3.39%)','88.50','85.50','88.50','88.50','85.00','3.52M']}
        self.assertIsNone(parse_quote(raw,'KCB',1800000000))

class HistoryTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_history_uses_source_session_and_preserves_close_only_evidence(self):
        events=[]
        class Downloader:
            async def fetch(self,url,request_headers=None):
                events.append(('fetch',url,request_headers))
                return '<script>var MSPGSID="public-fixture-session";</script>' if '/stock=' in url else 'chart'
        class IO:
            source={'id':'mystocks-history','config':{'historyDays':500}}
            downloader=Downloader()
            async def persist(self,document,artifact,adapter,version):
                events.append(('persist',version))
                return {'document':document,'artifact':artifact,'cleanup':lambda:events.append(('cleanup',artifact))}
            def text(self,artifact,limit):return artifact
        adapter=MyStocksHistoryAdapter(IO(),['DTB','KCB','bad/unsafe'])
        docs=await adapter.discover()
        self.assertEqual(len(docs),2);self.assertIn('stock=DTK?',docs[0]['url'])
        fetched=await adapter.fetch(docs[0])
        self.assertEqual(fetched['artifact'],'chart')
        self.assertIn(('cleanup','<script>var MSPGSID="public-fixture-session";</script>'),events)
        graph=next(e for e in events if e[0]=='fetch' and '/graphs/chart/' in e[1])
        self.assertIn('/DTK?',graph[1]);self.assertIn(';r=720;',graph[1]);self.assertEqual(graph[2]['X-MSL-Chart'],'public-fixture-session')
        self.assertEqual(graph[2]['Referer'],docs[0]['url'])
        self.assertEqual(adapter.persistent_batch_size,20)
    async def test_invalid_window_is_rejected_before_network(self):
        class IO:source={'id':'mystocks-history','config':{'historyDays':True}}
        with self.assertRaises(ValueError):await MyStocksHistoryAdapter(IO(),['KCB']).discover()

class HeaderTests(unittest.IsolatedAsyncioTestCase):
    async def test_untrusted_source_headers_fail_before_dns_or_socket(self):
        downloader=Downloader(SourcePolicy('fixture',('fixture.example',),True))
        with patch('continua_scraper.download.resolve_public',side_effect=AssertionError('Unsafe header reached network')):
            for headers in [{'Authorization':'secret'},{'Cookie':'session'},{'Referer':'https://evil.example/'},{'Accept':'application/json\r\nCookie: secret'}]:
                with self.assertRaises((ValueError,PermissionError)):await downloader._connection('https://fixture.example/quote',request_headers=headers)
