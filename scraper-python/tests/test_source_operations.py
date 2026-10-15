import json
import unittest
from contextlib import asynccontextmanager
from continua_scraper.source_operations import record_permission,disable_news_source


class Database:
    def __init__(self,exists=True):self.exists=exists;self.calls=[];self.committed=False
    @asynccontextmanager
    async def transaction(self):
        yield self
        self.committed=True
    async def query(self,sql,params=()):
        self.calls.append((sql,params))
        if sql.startswith('SELECT id'):return [{'id':'licensed'}] if self.exists else []
        if 'WITH removed' in sql:return [{'removed':3}]
        return []


class SourceOperationsTests(unittest.IsolatedAsyncioTestCase):
    async def test_permission_is_exact_and_does_not_enable_or_approve_mapping(self):
        database=Database()
        result=await record_permission(database,'licensed','operator:2026-10-15','Automated collection and commercial display')
        self.assertTrue(database.committed)
        self.assertFalse(result['collectionEnablementChanged'])
        self.assertFalse(result['mappingApprovalChanged'])
        sql,params=database.calls[1]
        self.assertNotIn('enabled=',sql)
        self.assertEqual(params[2],'licensed')
        self.assertEqual(json.loads(params[1]),{'permissionReference':'operator:2026-10-15','permissionBasis':'user_assertion'})

    async def test_unknown_source_never_mutates(self):
        database=Database(False)
        with self.assertRaises(ValueError):await record_permission(database,'missing','operator:covered','Collection')
        self.assertFalse(database.committed)
        self.assertEqual(len(database.calls),1)

    async def test_disable_removes_only_public_news_and_preserves_originals(self):
        database=Database()
        result=await disable_news_source(database,'licensed')
        self.assertTrue(database.committed)
        self.assertEqual(result['newsRemoved'],3)
        self.assertTrue(result['originalEvidencePreserved'])
        sql=' '.join(call[0] for call in database.calls)
        self.assertNotIn('DELETE FROM scraping.',sql)
        self.assertIn('WHERE source=%s',sql)

    async def test_invalid_permission_never_connects(self):
        database=Database()
        for reference in ('',None,False,'x'*201):
            with self.assertRaises(ValueError):await record_permission(database,'licensed',reference,'Collection')
        self.assertEqual(database.calls,[])
