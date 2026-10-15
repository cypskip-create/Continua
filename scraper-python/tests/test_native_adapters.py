import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.html import afx_profile_facts,afx_close_candidates,kenyan_file_links,archive_form_config,archive_documents,resolve_url
from continua_scraper.rss import feed_documents
from continua_scraper.nse import NseAdapter

class ParserTests(unittest.TestCase):
    def test_feed_newest_first_literal_author_and_summary(self):
        rss='''<rss version="2.0"><channel><title>Fixture</title><item><title>Old</title><link>https://fixture.example/old</link><pubDate>Mon, 12 Oct 2026 12:00:00 GMT</pubDate><description>Old summary</description></item><item><title>New</title><link>https://fixture.example/new</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Actual feed summary &amp; source.</p>]]></description><category>Stocks</category></item></channel></rss>'''
        docs=feed_documents(rss,'https://fixture.example/feed',1)
        self.assertEqual(len(docs),1);self.assertEqual(docs[0]['title'],'New')
        self.assertEqual(docs[0]['context']['publishedAt'],'2026-10-13T12:00:00.000Z')
        self.assertEqual(docs[0]['context']['feedSummary'],'Actual feed summary & source.')
        atom='<feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture</title><entry><title>Atom</title><id>source-id</id><link href="https://fixture.example/atom"/><updated>2026-10-13T12:00:00Z</updated><author><name>Author</name></author><summary>Evidence</summary></entry></feed>'
        self.assertEqual(feed_documents(atom,'https://fixture.example/feed')[0]['context']['author'],'Author')

    def test_publisher_links_reject_credentials_and_wrong_issuer_source(self):
        self.assertIsNone(resolve_url('https://fixture.example/','https://user:secret@fixture.example/a'))
        self.assertIsNone(resolve_url('https://fixture.example/','javascript:alert(1)'))
        self.assertEqual(kenyan_file_links('<div class="file-content"><link itemprop="url" href="https://evil.example/a.pdf"></div>','https://kenyanstocks.com/'),[])
        self.assertEqual(archive_documents('<h3>Report</h3><a href="https://evil.example/a.pdf">link</a>','https://www.nse.co.ke/'),[])
        html='<script>var wp_ajax = {"nse_id":1,"ajaxurl":"https://evil.example/post","ajaxnonce":"secret"};</script>'
        self.assertIsNone(archive_form_config(html))

    def test_future_invalid_and_nonpositive_closes_do_not_publish(self):
        html='<table><tr><th>Date</th><th>Volume</th><th>Close</th></tr><tr><td>2099-01-01</td><td>1</td><td>20</td></tr><tr><td>2026-02-30</td><td>1</td><td>20</td></tr><tr><td>2026-01-01</td><td>1</td><td>0</td></tr></table>'
        self.assertEqual(afx_close_candidates(html),[])
        self.assertIsNone(afx_profile_facts('<h3>Not a verified fact block</h3>'))

class NseTests(unittest.IsolatedAsyncioTestCase):
    async def test_archive_completion_follows_enqueue_and_failure_retains_page(self):
        events=[]
        class Jobs:
            async def enqueue(self,source,docs):events.append(('enqueue',len(docs)))
        class Checkpoints:
            async def get(self,*args):return {'pages':[1,2],'completed_pages':[]}
            async def complete(self,*args):events.append(('complete',args[3]))
        class Downloader:
            async def robots_allowed(self,url):return True
        class IO:source={'id':'nse','config':{}};downloader=Downloader()
        adapter=NseAdapter(IO(),Jobs(),Checkpoints(),None)
        form='<script>var wp_ajax = {"nse_id":1,"ajaxurl":"https://www.nse.co.ke/wp-admin/admin-ajax.php","ajaxnonce":"fixture"};</script><button class="yearclick" data-year="2025" data-cid="1"></button>'
        async def page(url,form_body=None):
            if form_body:
                if form_body['page']=='2':raise ValueError('expired publisher form')
                return url,'<h3>Report</h3><a href="/report.pdf">Report</a>'
            return url,form if 'announcements' in url else ''
        adapter._page=page
        documents=await adapter.discover()
        self.assertEqual(len(documents),1);self.assertEqual(events,[('enqueue',1),('complete',1)])

if __name__=='__main__':unittest.main()
