import hashlib
import pathlib
import sys
import unittest
from contextlib import contextmanager,asynccontextmanager
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.legacy_cleanup import validate_candidate,verify_pair,VerifiedLegacyCleanup
from continua_scraper.transfer_budget import TransferLimitReached

DIGEST=hashlib.sha256(b'fixture').hexdigest()
def candidate():return dict(legacy_key=f'source/2026/{DIGEST}.pdf',sha256=DIGEST,size_bytes=7,object_uri=f'r2://continua-financial-documents/source/2026/{DIGEST}.pdf',artifact_ids=[1,2],original_id='fixture-id',original_updated_at='2026-10-18T00:00:00Z')

class Storage:
    def __init__(self,corrupt=False):
        self.r2=SimpleNamespace(bucket='continua-financial-documents',key_from_location=lambda uri:uri.split('continua-financial-documents/',1)[1])
        self.rollback=SimpleNamespace(bucket='scraper-raw',materialize=self.materialize)
        self.corrupt=corrupt
    @contextmanager
    def materialize(self,key):yield SimpleNamespace(size=7,sha256='0'*64 if self.corrupt else DIGEST)

class CleanupIdentityTests(unittest.TestCase):
    def test_only_owned_content_addressed_bounded_candidates_are_accepted(self):
        row=candidate();validate_candidate(row,Storage())
        for changed in [dict(row,legacy_key='source/old.pdf'),dict(row,size_bytes=0),dict(row,size_bytes=51*1024**2),dict(row,original_id='')]:
            with self.assertRaises(ValueError):validate_candidate(changed,Storage())
        other=Storage();other.rollback.bucket='avatars'
        with self.assertRaises(ValueError):validate_candidate(row,other)
    def test_corrupt_or_missing_matching_copy_never_verifies(self):
        verify_pair(candidate(),Storage())
        with self.assertRaisesRegex(ValueError,'checksum'):verify_pair(candidate(),Storage(corrupt=True))

class Connection:
    async def execute(self,*args):return self
    async def fetchone(self):return {'acquired':True}

class DB:
    def __init__(self,superseded=False):self.row=candidate();self.reads=0;self.calls=[];self.superseded=superseded;self.removed=False;self.pool=self
    @asynccontextmanager
    async def connection(self):yield Connection()
    async def query(self,sql,args=()):
        self.calls.append((sql,args))
        if sql.startswith('WITH copies'):
            self.reads+=1
            return [] if self.superseded and self.reads>1 else [self.row]
        if 'RETURNING id' in sql:return [{'id':1},{'id':2}]
        if sql.startswith('SELECT id FROM storage.objects'):return [] if self.removed else [{'id':'still-there'}]
        return []

class CleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_database_recheck_and_durable_receipt_precede_exact_removal(self):
        db=DB();worker=VerifiedLegacyCleanup(db,Storage())
        def remove(row,storage):
            self.assertIn('verified-before-removal',db.calls[-1][1][0]);db.removed=True
        with patch('continua_scraper.legacy_cleanup.remove_exact',side_effect=remove) as deletion:
            self.assertEqual((await worker.run(1))['deleted'],1);deletion.assert_called_once()
        self.assertIn('deletedAt',db.calls[-1][1][0]);await worker.close()
    async def test_corruption_or_changed_reference_prevents_any_deletion(self):
        for db,storage in [(DB(),Storage(corrupt=True)),(DB(superseded=True),Storage())]:
            worker=VerifiedLegacyCleanup(db,storage)
            with patch('continua_scraper.legacy_cleanup.remove_exact') as deletion:
                result=await worker.run(1);self.assertEqual(result['deleted'],0);deletion.assert_not_called()
            await worker.close()
    async def test_budget_exhaustion_never_removes_and_close_reaps_without_masking_receipt(self):
        worker=VerifiedLegacyCleanup(DB(),Storage())
        with patch('continua_scraper.legacy_cleanup.verify_pair',side_effect=TransferLimitReached()),patch('continua_scraper.legacy_cleanup.remove_exact') as deletion:
            self.assertTrue((await worker.run(1))['budgetPaused'])
            await worker.close();deletion.assert_not_called()
