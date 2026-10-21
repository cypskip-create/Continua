import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.rss import RssAdapter
from continua_scraper.download import SourceHTTPError


class FeedAvailabilityTests(unittest.IsolatedAsyncioTestCase):
    def adapter(self, status, summary='Public publisher summary'):
        async def persist(document, artifact, *args, **kwargs):
            self.assertEqual(artifact.path.read_text(), summary)
            artifact.path.unlink()
            return kwargs['metadata']
        io = SimpleNamespace(source={'id': 'test', 'config': {'feedUrl': 'https://publisher.example/feed/'}},
            downloader=SimpleNamespace(robots_allowed=AsyncMock(return_value=True)),
            fetch_document=AsyncMock(side_effect=SourceHTTPError(status)), persist=persist)
        return RssAdapter(io), {'url': 'https://publisher.example/article', 'context': {'feedSummary': summary}}

    async def test_unavailable_article_keeps_real_feed_evidence(self):
        for status in (403, 404, 410):
            adapter, document = self.adapter(status)
            result = await adapter.fetch(document)
            self.assertEqual(result['contentSource'], 'rss_summary')
            self.assertEqual(result['articleHTTPStatus'], status)
            self.assertEqual(result['evidenceUrl'], adapter.feed_url)
            adapter.io.fetch_document.assert_awaited_once()

    async def test_missing_summary_and_transient_errors_remain_failures(self):
        for status, summary in ((403, ''), (404, ''), (500, 'summary'), (429, 'summary')):
            adapter, document = self.adapter(status, summary)
            with self.assertRaises(SourceHTTPError): await adapter.fetch(document)

    async def test_robots_remains_enforced(self):
        adapter, document = self.adapter(403)
        adapter.io.downloader.robots_allowed.return_value = False
        result = await adapter.fetch(document)
        self.assertFalse(result['articleRobotsAllowed'])
        adapter.io.fetch_document.assert_not_awaited()
