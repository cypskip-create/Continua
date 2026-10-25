import unittest
from continua_scraper.documents import DocumentJobs
from continua_scraper.rss import RssAdapter

class Database:
    async def query(self,sql,values):self.sql,self.values=sql,values;return []

class NewsPriorityTests(unittest.IsolatedAsyncioTestCase):
    async def test_latest_feed_dates_precede_backlog_without_changing_leases_or_retries(self):
        db=Database();jobs=DocumentJobs(db)
        await jobs.claim('registered-rss',1,newest_first=True)
        self.assertIn("ORDER BY document->'context'->>'publishedAt' DESC NULLS LAST",db.sql)
        self.assertIn('FOR UPDATE SKIP LOCKED',db.sql);self.assertIn('next_attempt_at<=now()',db.sql)
        self.assertEqual(db.values,('registered-rss',1));self.assertTrue(RssAdapter.document_newest_first)
        await jobs.claim('document-source',1)
        self.assertNotIn("ORDER BY document->'context'->>'publishedAt'",db.sql)
        await DocumentJobs(db,max_attempts=5).claim('registered-rss',1,newest_first=True)
        self.assertIn('AND attempts<%s',db.sql);self.assertEqual(db.values,('registered-rss',5,1))
