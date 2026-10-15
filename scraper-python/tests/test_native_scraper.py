import asyncio
import hashlib
import io
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.policy import SourcePolicy,UnsafeURL,resolve_public,robots_allows
from continua_scraper.download import copy_body,Artifact
from continua_scraper.r2 import R2Storage,safe_key

class PolicyTests(unittest.IsolatedAsyncioTestCase):
    def test_domains_credentials_permissions(self):
        policy=SourcePolicy("fixture",("fixture.example",),True)
        self.assertEqual(policy.check_url("https://fixture.example/file.pdf").hostname,"fixture.example")
        for url in ("file:///private","https://fixture.example.attacker.test/x","https://user:pass@fixture.example/x","http://fixture.example:8080/x"):
            with self.assertRaises(UnsafeURL):policy.check_url(url)
        with self.assertRaises(PermissionError):SourcePolicy("fixture",("fixture.example",),False).check_url("https://fixture.example/x")
    async def test_dns_rejects_private_and_mixed_answers(self):
        records=[(2,1,6,"",("93.184.216.34",443)),(2,1,6,"",("127.0.0.1",443))]
        async def resolve(*args,**kwargs):return records
        with patch.object(asyncio.get_running_loop(),"getaddrinfo",resolve):
            with self.assertRaises(UnsafeURL):await resolve_public("fixture.example",443)
    def test_robots(self):
        self.assertFalse(robots_allows("User-agent: *\nDisallow: /private", "ContinuaBot/0.1","https://fixture.example/private/report.pdf"))
    async def test_body_is_streamed_and_hashed(self):
        reader=asyncio.StreamReader();reader.feed_data(b"fixture");reader.feed_eof();out=io.BytesIO()
        size,digest=await copy_body(reader,{"content-length":"7"},out,10)
        self.assertEqual(size,7);self.assertEqual(digest,hashlib.sha256(b"fixture").hexdigest())
    async def test_chunked_and_truncated_responses(self):
        reader=asyncio.StreamReader();reader.feed_data(b"3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n");reader.feed_eof()
        out=io.BytesIO();self.assertEqual((await copy_body(reader,{"transfer-encoding":"chunked"},out,10))[0],5)
        reader=asyncio.StreamReader();reader.feed_data(b"short");reader.feed_eof()
        with self.assertRaises(ValueError):await copy_body(reader,{"content-length":"8"},io.BytesIO(),10)
    async def test_limits_and_ambiguous_framing(self):
        for headers in ({"content-length":"11"},{"content-length":"7","transfer-encoding":"chunked"}):
            reader=asyncio.StreamReader();reader.feed_data(b"fixture");reader.feed_eof()
            with self.assertRaises(ValueError):await copy_body(reader,headers,io.BytesIO(),10)

class StorageTests(unittest.TestCase):
    def test_safe_keys(self):
        for key in ("../private","/root","source/../file","source\\file","source/file?token=x"):
            with self.assertRaises(ValueError):safe_key(key)
    def test_verified_streaming_upload_and_rollback(self):
        data=b"%PDF-fixture";hash=hashlib.sha256(data).hexdigest();calls=[]
        class Client:
            def head_object(self,**kwargs):
                error=RuntimeError('fixture missing');error.response={'ResponseMetadata':{'HTTPStatusCode':404}};raise error
            def put_object(self,**kwargs):self.body=kwargs["Body"].read();calls.append(kwargs["IfNoneMatch"])
            def get_object(self,**kwargs):return {"Body":io.BytesIO(self.body),"ContentLength":len(self.body)}
        with tempfile.TemporaryDirectory(prefix="continua-native-test-") as directory:
            file=pathlib.Path(directory)/"fixture.pdf";file.write_bytes(data)
            artifact=Artifact(file,"https://fixture.example/report.pdf","application/pdf",len(data),hash)
            storage=R2Storage(Client(),"private-documents",dual_write=True,rollback_write=lambda key,artifact:calls.append("rollback"))
            self.assertTrue(storage.upload(f"nse/2026/{hash}.pdf",artifact).startswith("r2://private-documents/"))
            self.assertEqual(calls,["*","rollback"])
    def test_corruption_never_returns_storage_reference(self):
        data=b"fixture";hash=hashlib.sha256(data).hexdigest()
        class Client:
            def head_object(self,**kwargs):
                error=RuntimeError('fixture missing');error.response={'ResponseMetadata':{'HTTPStatusCode':404}};raise error
            def put_object(self,**kwargs):pass
            def get_object(self,**kwargs):return {"Body":io.BytesIO(b"changed"),"ContentLength":7}
        with tempfile.TemporaryDirectory(prefix="continua-native-test-") as directory:
            file=pathlib.Path(directory)/"fixture";file.write_bytes(data)
            artifact=Artifact(file,"https://fixture.example/report.pdf","application/pdf",7,hash)
            with self.assertRaisesRegex(ValueError,"checksum"):
                R2Storage(Client(),"private-documents",dual_write=False).upload(f"nse/2026/{hash}.pdf",artifact)

if __name__=="__main__":unittest.main()
