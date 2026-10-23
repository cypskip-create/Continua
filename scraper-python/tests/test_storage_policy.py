import hashlib
import io
import os
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.storage import RawStorage
from continua_scraper.r2 import R2Storage
from continua_scraper.download import Artifact

class PolicyTests(unittest.TestCase):
    def test_legacy_duplicate_writes_are_rejected_even_with_credentials(self):
        with patch.dict(os.environ,{'RAW_STORAGE_DRIVER':'r2','R2_DUAL_WRITE':'true'},clear=True):
            with self.assertRaisesRegex(ValueError,'Supabase file writes are disabled'):RawStorage.from_environment()

    def test_render_and_production_never_fall_back_to_local_or_other_storage(self):
        for environment in [{'RENDER':'true'},{'RENDER_SERVICE_ID':'fixture'},{'NODE_ENV':'production'}]:
            for driver in ('local','supabase',''):
                with patch.dict(os.environ,{**environment,'RAW_STORAGE_DRIVER':driver},clear=True):
                    with self.assertRaisesRegex(ValueError,'private R2'):RawStorage.from_environment()

    def test_legacy_reader_credentials_do_not_enable_dual_write(self):
        with patch.dict(os.environ,{'SUPABASE_SERVICE_ROLE_KEY':'fixture','SUPABASE_URL':'https://jjsetogmnumoudrovpzn.supabase.co','R2_DUAL_WRITE':'false'},clear=True),patch('continua_scraper.storage.PrivateSupabaseStorage') as legacy,patch('continua_scraper.storage.R2Storage.from_environment') as r2:
            driver=RawStorage.from_environment()
            self.assertIsNone(driver.rollback)
            legacy.assert_not_called()
            r2.assert_called_once_with(rollback_write=None)

    def test_existing_object_is_verified_without_resending_or_dual_writing(self):
        data=b'%PDF fixture';digest=hashlib.sha256(data).hexdigest()
        class Client:
            def head_object(self,**kwargs):return {'ContentLength':len(data)}
            def get_object(self,**kwargs):return {'ContentLength':len(data),'Body':io.BytesIO(data)}
            def put_object(self,**kwargs):raise AssertionError('Duplicate upload')
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'fixture.pdf';path.write_bytes(data)
            artifact=Artifact(path,'https://fixture.example/a.pdf','application/pdf',len(data),digest)
            storage=R2Storage(Client(),'private-fixture',rollback_write=lambda *_:self.fail('Unexpected duplicate legacy write'))
            self.assertEqual(storage.upload('fixture/'+digest+'.pdf',artifact),'r2://private-fixture/fixture/'+digest+'.pdf')
            self.assertEqual(storage.transfers.snapshot()['counters']['uploadPayloadBytesAvoided'],len(data))
            self.assertEqual(storage.transfers.snapshot()['counters']['uploadPayloadBytesAttempted'],0)

    def test_existing_size_match_does_not_bypass_checksum_verification(self):
        data=b'fixture';digest=hashlib.sha256(data).hexdigest()
        class Client:
            def head_object(self,**kwargs):return {'ContentLength':len(data)}
            def get_object(self,**kwargs):return {'ContentLength':len(data),'Body':io.BytesIO(b'changed')}
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'fixture';path.write_bytes(data)
            with self.assertRaisesRegex(ValueError,'checksum'):
                R2Storage(Client(),'private-fixture').upload('fixture/'+digest+'.bin',Artifact(path,'https://fixture.example/a','application/octet-stream',len(data),digest))
