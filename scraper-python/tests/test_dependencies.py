"""Real dependency-model tests; provider traffic is intercepted, never charged."""
import importlib.util
import io
import hashlib
import pathlib
import sys
import tempfile
import os
from unittest.mock import patch
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.database import Database
from continua_scraper.download import Artifact
from continua_scraper.r2 import R2Storage

@unittest.skipUnless(importlib.util.find_spec("boto3"),"install pinned native scraper dependencies")
class R2DependencyTests(unittest.TestCase):
    def test_factory_retry_reservation_matches_real_sdk_attempt_ceiling(self):
        with patch.dict(os.environ,{'R2_ACCOUNT_ID':'0'*32,'R2_BUCKET':'private-fixture','R2_ACCESS_KEY_ID':'fixture-not-live','R2_SECRET_ACCESS_KEY':'fixture-not-live','R2_UPLOAD_ATTEMPTS':'1'},clear=True):
            storage=R2Storage.from_environment()
            try:
                self.assertEqual(storage.upload_attempts,1)
                self.assertEqual(storage.client.meta.config.retries['total_max_attempts'],1)
            finally:storage.close()

    def test_real_sdk_supports_private_conditional_streaming_upload(self):
        import boto3
        from botocore.config import Config
        from botocore.response import StreamingBody
        from botocore.stub import Stubber,ANY
        client=boto3.client("s3",region_name="auto",endpoint_url="https://00000000000000000000000000000000.r2.cloudflarestorage.com",
            aws_access_key_id="fixture-not-live",aws_secret_access_key="fixture-not-live",config=Config(retries={"max_attempts":0}))
        data=b"%PDF-fixture-native-sdk"
        digest=hashlib.sha256(data).hexdigest()
        key=f"nse/2026/{digest}.pdf"
        with tempfile.TemporaryDirectory(prefix="continua-native-sdk-") as directory,Stubber(client) as stub:
            path=pathlib.Path(directory)/"fixture.pdf"
            path.write_bytes(data)
            artifact=Artifact(path,"https://fixture.example/report.pdf","application/pdf",len(data),digest)
            stub.add_client_error('head_object',service_error_code='404',http_status_code=404,expected_params={'Bucket':'private-fixture','Key':key})
            stub.add_response("put_object",{}, {"Bucket":"private-fixture","Key":key,"Body":ANY,"ContentLength":len(data),"ContentType":"application/pdf","Metadata":{"sha256":digest},"IfNoneMatch":"*"})
            stub.add_response("get_object",{"ContentLength":len(data),"Body":StreamingBody(io.BytesIO(data),len(data))},{"Bucket":"private-fixture","Key":key})
            storage=R2Storage(client,"private-fixture",dual_write=False)
            self.assertEqual(storage.upload(key,artifact),f"r2://private-fixture/{key}")
            stub.assert_no_pending_responses()
        client.close()

@unittest.skipUnless(importlib.util.find_spec("psycopg_pool"),"install pinned native scraper dependencies")
class PostgreSQLDependencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_pool_factory_is_bounded_lazy_and_closes(self):
        # min_size=0 means no connection/provider request is made by this test.
        database=await Database.open("postgresql://fixture:fixture@127.0.0.1:1/fixture")
        try:
            self.assertEqual(database.pool.min_size,0)
            self.assertEqual(database.pool.max_size,2)
            self.assertIsNone(database.pool.kwargs["prepare_threshold"])
        finally:
            await database.close()

if __name__=="__main__":unittest.main()
