"""Opt-in synthetic SQL fixture. Never reads DATABASE_URL or contacts a source."""
import asyncio
import os
import pathlib
import sys
import unittest
import uuid
from urllib.parse import urlsplit,parse_qs
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.database import Database
from continua_scraper.documents import DocumentJobs
from continua_scraper.sources import Sources
from continua_scraper.artifacts import EvidenceRepository
from continua_scraper.crawl_state import CrawlState
from continua_scraper.archive_checkpoints import ArchiveCheckpoints
from continua_scraper.dead_letters import DeadLetters
from continua_scraper.event_loop import database_event_loop

_previous_policy=None
def setUpModule():
    # Local bundled Python is 3.12; unittest's loop_factory hook starts at 3.13.
    # Scope this compatibility policy to this fixture module, never the service.
    global _previous_policy
    if os.name=='nt' and sys.version_info<(3,13):
        _previous_policy=asyncio.get_event_loop_policy()
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
def tearDownModule():
    if _previous_policy is not None:asyncio.set_event_loop_policy(_previous_policy)

class CollectorPostgresTests(unittest.IsolatedAsyncioTestCase):
    loop_factory=staticmethod(database_event_loop)
    async def asyncSetUp(self):
        connection=os.environ.get('NATIVE_COLLECTOR_POSTGRES_FIXTURE_URL','')
        if not connection:self.skipTest('dedicated disposable collector PostgreSQL fixture required')
        target=urlsplit(connection)
        if target.hostname!='127.0.0.1' or not target.port or target.path!='/continua_native_fixture' or parse_qs(target.query).get('application_name')!=['continua-native-fixture']:
            self.fail('refusing non-fixture database destination')
        self.database=await Database.open(connection)
        self.addAsyncCleanup(self.database.close)
        check=await self.database.query("SELECT current_database()='continua_native_fixture' AND to_regclass('scraping.document_jobs') IS NOT NULL AS valid")
        self.assertTrue(check[0]['valid'])
        self.source_id='native-collector-fixture-'+uuid.uuid4().hex
        self.source={'id':self.source_id,'name':'Synthetic collector fixture','adapter':'web','enabled':False,'config':{'permissionReference':'synthetic-fixture-only'},'redistributionAllowed':False,'attributionRequired':True}
        self.sources=Sources(self.database)
        await self.sources.save(self.source)

    async def test_concurrent_claim_restart_and_stale_completion_token(self):
        jobs=DocumentJobs(self.database)
        await jobs.enqueue(self.source_id,[{'url':'https://fixture.example/report.pdf','type':'pdf','context':{}}])
        a,b=await asyncio.gather(jobs.claim(self.source_id,1),jobs.claim(self.source_id,1))
        self.assertEqual(sorted((len(a),len(b))),[0,1])
        first=(a or b)[0]
        await self.database.query("UPDATE scraping.document_jobs SET lease_until=now()-interval '1 second' WHERE id=%s",(first['id'],))
        other=await Database.open(os.environ['NATIVE_COLLECTOR_POSTGRES_FIXTURE_URL'])
        try:
            restarted=DocumentJobs(other)
            second=(await restarted.claim(self.source_id,1))[0]
            self.assertEqual(second['attempts'],first['attempts']+1)
            await jobs.finish(first['id'],first['attempts'])
            state=await self.database.query('SELECT status FROM scraping.document_jobs WHERE id=%s',(first['id'],))
            self.assertEqual(state[0]['status'],'processing')
            await restarted.finish(second['id'],second['attempts'])
            self.assertEqual(await jobs.claim(self.source_id,1),[])
        finally:await other.close()

    async def test_source_disables_and_transaction_rollback_survive_restart(self):
        await self.sources.save({**self.source,'enabled':True,'redistributionAllowed':True},only_if_missing=True)
        stored=await self.sources.get(self.source_id)
        self.assertFalse(stored['enabled']);self.assertFalse(stored['redistributionAllowed'])
        with self.assertRaisesRegex(RuntimeError,'rollback fixture'):
            async with self.database.transaction() as tx:
                await tx.query('UPDATE scraping.sources SET enabled=true WHERE id=%s',(self.source_id,))
                raise RuntimeError('rollback fixture')
        self.assertFalse((await self.sources.get(self.source_id))['enabled'])

    async def test_hash_aliases_and_immutable_extraction_receipts(self):
        repository=EvidenceRepository(self.database)
        artifact={'sourceId':self.source_id,'adapter':'web','sha256':'f'*64,'documentUrl':'https://fixture.example/a.pdf','storagePath':'r2://fixture-private/synthetic/original.pdf','crawlerVersion':'synthetic-fixture','metadata':{}}
        first=await repository.upsert_artifact(artifact)
        second=await repository.upsert_artifact({**artifact,'documentUrl':'https://fixture.example/b.pdf'})
        self.assertEqual(first['artifact']['id'],second['artifact']['id'])
        self.assertTrue(first['isNew']);self.assertFalse(second['isNew'])
        aliases=await self.database.query('SELECT count(*) AS count FROM scraping.artifact_urls WHERE artifact_id=%s',(first['artifact']['id'],))
        self.assertEqual(aliases[0]['count'],2)
        extraction={'artifactId':first['artifact']['id'],'method':'json','confidence':.9,'parserVersion':'fixture-v1','text':'Observed synthetic source facts.','tables':[],'entity':{'ticker':'KCB'},'needsReview':True}
        one=await repository.insert_extraction(extraction)
        two=await repository.insert_extraction({**extraction,'parserVersion':'fixture-v2'})
        self.assertNotEqual(one['id'],two['id'])
        self.assertEqual((await repository.latest_extraction_for_ticker(first['artifact']['id'],'KCB'))['id'],two['id'])
        self.assertIsNone(await repository.latest_extraction_for_ticker(first['artifact']['id'],'SCOM'))

    async def test_crawl_lease_compare_and_swap_and_archive_checkpoint(self):
        states=CrawlState(self.database)
        url='https://fixture.example/archive'
        await states.discovered(self.source_id,url,0)
        first=(await states.claim(self.source_id,1))[0]
        await self.database.query("UPDATE scraping.crawl_state SET last_seen=now()-interval '2 hours' WHERE id=%s",(first['id'],))
        second=(await states.claim(self.source_id,1))[0]
        await states.failed(first['id'],first['lastSeen'],'stale synthetic attempt')
        rows=await self.database.query('SELECT status FROM scraping.crawl_state WHERE id=%s',(first['id'],))
        self.assertEqual(rows[0]['status'],'queued')
        await states.crawling(second['id'],second['lastSeen'])
        await states.crawled(second['id'],second['lastSeen'],200,'text/html','f'*64,True)
        self.assertIsNotNone(await states.by_hash(self.source_id,'f'*64))
        archives=ArchiveCheckpoints(self.database)
        await archives.get(self.source_id,url,2025)
        await archives.complete(self.source_id,url,2025,1,[1,2])
        receipt=await ArchiveCheckpoints(self.database).get(self.source_id,url,2025)
        self.assertEqual(receipt['completed_pages'],[1]);self.assertEqual(receipt['pages'],[1,2])

    async def test_dead_letters_keep_retry_counts_without_duplicate_rows(self):
        dead=DeadLetters(self.database)
        for _ in range(2):await dead.record(self.source_id,'https://fixture.example/a.pdf','parse','synthetic parse failure')
        rows=await dead.list(self.source_id,10)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['attempts'],2)
