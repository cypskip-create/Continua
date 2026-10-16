import pathlib
import sys
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.browser_controls import expand_groups
from continua_scraper.documents import DocumentJobs
from continua_scraper.html import kenyan_news_cards
from continua_scraper.kenyanstocks import KenyanStocksAdapter

class CoverageTests(unittest.TestCase):
    def test_recursive_expansion_requeries_new_controls_and_never_collapses(self):
        class Button:
            expanded=False
            def is_displayed(self):return True
            def is_enabled(self):return True
            def get_attribute(self,key):return 'expand-button expanded' if self.expanded else 'expand-button'
            def click(self):
                self.expanded=True
                if len(driver.buttons)==1:driver.buttons.append(Button())
        class Driver:
            buttons=[]
            def find_elements(self,*args):return [b for b in self.buttons if not b.expanded]
            def execute_script(self,*args):pass
        driver=Driver();driver.buttons=[Button()]
        self.assertEqual(expand_groups(driver,SimpleNamespace(CSS_SELECTOR='css'),lambda:None),(2,False))
        self.assertTrue(all(b.expanded for b in driver.buttons))
        driver.buttons=[Button()]
        self.assertEqual(expand_groups(driver,SimpleNamespace(CSS_SELECTOR='css'),lambda:None,limit=1),(1,True))

    def test_news_keeps_attribution_without_fetching_external_articles(self):
        html='''<a class="news-card" href="https://publisher.example/story"><span class="publisher-name">Publisher</span><time datetime="2026-10-15">15 Oct</time><h3 class="news-title">Results</h3><p class="news-description">Actual excerpt</p></a>'''
        rows=kenyan_news_cards(html,'https://kenyanstocks.com/stock/nse/COOP?tab=News')
        self.assertEqual(rows['entries'][0]['summary'],'Actual excerpt')
        self.assertEqual(rows['entries'][0]['publishedAt'],'2026-10-15')
        self.assertEqual(kenyan_news_cards(html.replace('https://publisher.example/story','javascript:alert(1)'),'https://kenyanstocks.com/')['entries'],[])

class AsyncCoverageTests(unittest.IsolatedAsyncioTestCase):
    async def test_each_discovered_and_catalogue_stock_gets_every_tab_and_category(self):
        class Downloader:
            async def robots_allowed(self,url):return True
        class IO:source={'id':'kenyanstocks'};downloader=Downloader()
        class Adapter(KenyanStocksAdapter):
            async def _discovery_page(self,url):
                if url=='https://kenyanstocks.com':return '<a href="/stock">Stocks</a><a href="/stock/nse/COOP">COOP</a>'
                return '<a href="/stock/nse/NEW1">New issuer not in app</a><a href="/stock/nse/COOP">Duplicate</a>'
        adapter=Adapter(IO(),None,None,None,universe=['KPC'])
        docs=await adapter.discover()
        for ticker in ('COOP','NEW1','KPC'):
            rows=[d for d in docs if d['context']['ticker']==ticker]
            self.assertEqual({r['context']['tab'] for r in rows},{'Summary','Financials','Statistics','News','Corporate Actions','Historical Data','Holders','Files'})
            self.assertEqual(len(rows),12)
            self.assertEqual(len([r for r in rows if r['context']['tab']=='Financials']),5)
        self.assertEqual(adapter.discovery_coverage,{'listingFailures':0,'listedStocks':2,'queuedStocks':3,'plannedViews':36})

    async def test_discovery_failure_remains_explicit_while_catalogue_fallback_runs(self):
        class Downloader:
            async def robots_allowed(self,url):return True
        class IO:source={'id':'kenyanstocks'};downloader=Downloader()
        class Adapter(KenyanStocksAdapter):
            async def _discovery_page(self,url):raise ValueError('fixture')
        adapter=Adapter(IO(),None,None,None,universe=['COOP'])
        self.assertEqual(len(await adapter.discover()),12)
        self.assertEqual(adapter.discovery_coverage['listingFailures'],1)

    async def test_pdf_parse_preserves_issuer(self):
        class PDF:
            async def extract(self,path):return {'method':'native_pdf_text','text':'literal report','tables':[],'needsReview':True}
        adapter=KenyanStocksAdapter(SimpleNamespace(source={'id':'kenyanstocks'}),None,None,PDF())
        result=await adapter.parse({'contentType':'application/pdf','artifact':SimpleNamespace(path='fixture'),'document':{'context':{'ticker':'COOP'}}})
        self.assertEqual(result['entity']['ticker'],'COOP')

    async def test_lane_is_bound_and_still_respects_retry_and_lease_guards(self):
        class DB:
            async def query(self,sql,params):self.sql,self.params=sql,params;return []
        db=DB();await DocumentJobs(db,max_attempts=5).claim('kenyanstocks',1,lane='News')
        self.assertEqual(db.params,('kenyanstocks',5,'News',1))
        self.assertIn('AND attempts<%s',db.sql);self.assertIn('FOR UPDATE SKIP LOCKED',db.sql)
        with self.assertRaises(ValueError):await DocumentJobs(db).claim('kenyanstocks',1,lane='arbitrary')
