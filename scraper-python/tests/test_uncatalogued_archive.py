import pathlib
import sys
import unittest
from contextlib import contextmanager, asynccontextmanager
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.uncatalogued_archive import preserve, UncataloguedArchive
from continua_scraper.transfer_budget import TransferLimitReached

HASH='a'*64
def candidate():
    return dict(legacy_key=f'fixture/2026/{HASH}.html',sha256=HASH,size_bytes=7,object_uri=f'r2://continua-financial-documents/fixture/2026/{HASH}.html',original_id='original',original_updated_at='2026-10-19T00:00:00Z')

class Storage:
    def __init__(self,corrupt=False):
        self.uploads=[];self.corrupt=corrupt
        self.r2=SimpleNamespace(bucket='continua-financial-documents',dual_write=False,key_from_location=lambda x:x.split('continua-financial-documents/')[1],upload=lambda k,a:self.uploads.append(k))
        self.rollback=SimpleNamespace(bucket='scraper-raw',materialize=self.materialize)
    @contextmanager
    def materialize(self,key):yield SimpleNamespace(size=7,sha256='b'*64 if self.corrupt else HASH)

class Connection:
    async def execute(self,*args,**kwargs):return self
    async def fetchone(self):return {'acquired':True}

class Database:
    def __init__(self,changed=False):self.pool=self;self.calls=[];self.changed=changed;self.reads=0;self.removed=False
    @asynccontextmanager
    async def connection(self):yield Connection()
    async def query(self,sql,args=()):
        self.calls.append((sql,args))
        if sql.startswith('WITH refs'):
            self.reads+=1
            return [] if self.changed and self.reads>1 else [candidate()]
        if sql.startswith('SELECT id FROM storage.objects'):return [] if self.removed else [{'id':'retained'}]
        return []

class PreserveTests(unittest.TestCase):
    def test_source_integrity_and_owned_destination_are_required(self):
        storage=Storage();preserve(candidate(),storage);self.assertEqual(len(storage.uploads),1)
        for storage in (Storage(corrupt=True),Storage()):
            if not storage.corrupt:storage.r2.dual_write=True
            with self.assertRaises(ValueError):preserve(candidate(),storage)
            self.assertEqual(storage.uploads,[])

class RecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_full_verification_and_durable_receipt_precede_exact_deletion(self):
        db=Database();worker=UncataloguedArchive(db,Storage())
        def remove(row,storage):
            self.assertTrue(db.calls[-1][0].startswith('INSERT INTO scraping.uncatalogued_raw_archive'))
            db.removed=True
        with patch('continua_scraper.uncatalogued_archive.verify_pair'),patch('continua_scraper.uncatalogued_archive.remove_exact',side_effect=remove):
            result=await worker.run(1)
        self.assertEqual(result['deleted'],1);self.assertIn("state='deleted'",db.calls[-1][0]);await worker.close()

    async def test_changed_metadata_corruption_and_budget_pause_never_delete(self):
        for db,storage in ((Database(changed=True),Storage()),(Database(),Storage(corrupt=True))):
            worker=UncataloguedArchive(db,storage)
            with patch('continua_scraper.uncatalogued_archive.verify_pair'),patch('continua_scraper.uncatalogued_archive.remove_exact') as remove:
                self.assertEqual((await worker.run(1))['deleted'],0);remove.assert_not_called()
            await worker.close()
        worker=UncataloguedArchive(Database(),Storage())
        with patch('continua_scraper.uncatalogued_archive.preserve',side_effect=TransferLimitReached()),patch('continua_scraper.uncatalogued_archive.remove_exact') as remove:
            self.assertTrue((await worker.run(1))['budgetPaused']);remove.assert_not_called();await worker.close()
