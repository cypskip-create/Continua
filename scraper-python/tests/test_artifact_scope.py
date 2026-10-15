import pathlib
import sys
import unittest
from contextlib import asynccontextmanager

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.artifacts import EvidenceRepository


class Database:
    def __init__(self):
        self.calls = []

    @asynccontextmanager
    async def transaction(self):
        yield self

    async def query(self, sql, args):
        self.calls.append((sql, args))
        if 'RETURNING *, (xmax=0)' in sql:
            return [{'id': 7, 'document_url': 'https://live.mystocks.co.ke/x/f123-KCB', 'is_new': False}]
        return []


class ArtifactScopeTests(unittest.IsolatedAsyncioTestCase):
    def artifact(self, ticker):
        return dict(sourceId=1, adapter='mystocks', sha256='a'*64,
                    documentUrl=f'https://live.mystocks.co.ke/x/f456-{ticker}',
                    storagePath='r2://continua-financial-documents/fixture', crawlerVersion='test')

    async def test_unchanged_ticker_nonce_does_not_add_alias(self):
        database = Database()
        await EvidenceRepository(database).upsert_artifact(self.artifact('KCB'))
        self.assertEqual(len(database.calls), 1)

    async def test_shared_bytes_preserve_other_ticker_actual_url(self):
        database = Database()
        await EvidenceRepository(database).upsert_artifact(self.artifact('ABSA'))
        self.assertEqual(len(database.calls), 2)
        sql, args = database.calls[1]
        self.assertIn('WHERE NOT EXISTS', sql)
        self.assertEqual(args[1], 'https://live.mystocks.co.ke/x/f456-ABSA')
        self.assertTrue(args[3].endswith('ABSA$'))

    async def test_extraction_scope_is_validated_before_query(self):
        database = Database()
        repository = EvidenceRepository(database)
        with self.assertRaises(ValueError):
            await repository.latest_extraction_for_ticker(7, "KCB' OR true")
        self.assertEqual(database.calls, [])
        await repository.latest_extraction_for_ticker(7, 'KCB')
        self.assertIn("entity->>'ticker'=%s", database.calls[0][0])
        self.assertEqual(database.calls[0][1], (7, 'KCB'))
