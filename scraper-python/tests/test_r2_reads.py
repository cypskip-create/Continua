import hashlib
import io
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.r2 import R2Storage

class Client:
    def __init__(self,data,length=None):
        self.data=data
        self.body=io.BytesIO(data)
        self.length=len(data) if length is None else length
        self.calls=[]
    def get_object(self,**kwargs):
        self.calls.append(kwargs)
        return {"Body":self.body,"ContentLength":self.length,"ContentType":"application/pdf"}

class R2ReadTests(unittest.TestCase):
    def test_verified_stream_closed_before_extraction_and_file_cleanup(self):
        data=b"%PDF-fixture"*10000
        key=f"source/2026/{hashlib.sha256(data).hexdigest()}.pdf"
        client=Client(data);storage=R2Storage(client,"private-fixture",dual_write=False)
        with storage.materialize(key,source_url="https://fixture.example/report.pdf") as artifact:
            path=artifact.path
            self.assertTrue(path.exists())
            self.assertTrue(client.body.closed)
            self.assertEqual(artifact.size,len(data))
            self.assertEqual(artifact.url,"https://fixture.example/report.pdf")
        self.assertFalse(path.exists())
        self.assertEqual(client.calls,[{"Bucket":"private-fixture","Key":key}])

    def test_checksum_size_and_reader_failure_never_yield(self):
        for length,data,hash_value in [(20,b"short","0"*64),(1,b"too long","0"*64),(5,b"wrong","0"*64)]:
            client=Client(data,length);storage=R2Storage(client,"private-fixture",dual_write=False,max_bytes=10)
            with self.assertRaises(ValueError):
                with storage.materialize(f"source/{hash_value}.pdf"):
                    self.fail("unverified artifact yielded")
            self.assertTrue(client.body.closed)

    def test_extraction_failure_removes_temporary_file(self):
        data=b"fixture";client=Client(data);storage=R2Storage(client,"private-fixture",dual_write=False)
        with self.assertRaises(RuntimeError):
            with storage.materialize(f"source/{hashlib.sha256(data).hexdigest()}.pdf") as artifact:
                path=artifact.path
                raise RuntimeError("fixture extraction failed")
        self.assertFalse(path.exists())

    def test_location_cannot_change_bucket_or_endpoint(self):
        storage=R2Storage(Client(b""),"private-fixture",dual_write=False)
        self.assertEqual(storage.key_from_location("r2://private-fixture/source/hash.pdf"),"source/hash.pdf")
        for uri in ["r2://other/source/hash.pdf","https://private-fixture/source/hash.pdf","r2://user@private-fixture/a.pdf","r2://private-fixture:443/a.pdf","r2://private-fixture/../a.pdf","r2://private-fixture/a.pdf?token=secret","r2://private-fixture/a.pdf#fragment"]:
            with self.assertRaises(ValueError):storage.key_from_location(uri)

if __name__=="__main__":unittest.main()
