import unittest
from types import SimpleNamespace
from continua_scraper.crawler import GenericCrawler
from continua_scraper.download import SourceHTTPError

class Availability(unittest.IsolatedAsyncioTestCase):
    async def collect(self,status):
        audit=[]
        async def noop(*args,**kwargs):pass
        async def claim(*args):return [{'id':'fixture','lastSeen':1,'url':'https://publisher.invalid/report.pdf','depth':0}]
        async def allowed(url):return True
        async def fetch(*args):raise SourceHTTPError(status)
        async def failed(*args):audit.append(args[-1])
        io=SimpleNamespace(source={'id':'fixture','enabled':True,'adapter':'web','config':{}},downloader=SimpleNamespace(robots_allowed=allowed),fetch_document=fetch)
        state=SimpleNamespace(claim=claim,crawling=noop,failed=failed)
        result=await GenericCrawler(io,state,SimpleNamespace(record=noop)).run(1)
        self.assertEqual(audit,[f'fetch: SourceHTTPError:{status}'])
        return result
    async def test_removed_links_record_unavailable_without_inventing_artifacts(self):
        for status in (404,410):
            result=await self.collect(status)
            self.assertEqual(result['failed'],0);self.assertEqual(result['unavailable'],1);self.assertEqual(result['stored'],0)
    async def test_auth_throttles_and_provider_outages_remain_failures(self):
        for status in (401,403,429,500,503):
            result=await self.collect(status)
            self.assertEqual(result['failed'],1);self.assertNotIn('unavailable',result)
