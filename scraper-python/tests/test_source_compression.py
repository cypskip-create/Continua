import hashlib
import io
import pathlib
import sys
import tempfile
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.storage import RawStorage
from continua_scraper.r2 import R2Storage
from continua_scraper.download import Artifact
from continua_scraper.extraction import ExtractionService

class Client:
    def __init__(self):self.objects={};self.writes=[]
    def head_object(self,**args):
        if args['Key'] not in self.objects:
            error=RuntimeError('fixture missing');error.response={'ResponseMetadata':{'HTTPStatusCode':404}};raise error
        return {'ContentLength':len(self.objects[args['Key']][0])}
    def put_object(self,**args):
        self.writes.append(args['Key']);self.objects[args['Key']]=(args['Body'].read(),args)
    def get_object(self,**args):
        data,metadata=self.objects[args['Key']]
        return {'Body':io.BytesIO(data),'ContentLength':len(data),'ContentType':metadata['ContentType'],'ContentEncoding':metadata.get('ContentEncoding')}

class CompressionTests(unittest.TestCase):
    def test_source_bytes_hash_and_type_restore_exactly_with_less_transfer(self):
        data=('<html><body>'+ 'Reported revenue: KES 1,000,000. Literal evidence. '*10000+'</body></html>').encode()
        digest=hashlib.sha256(data).hexdigest();client=Client();driver=RawStorage(R2Storage(client,'private-fixture'),None)
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'source';path.write_bytes(data)
            artifact=Artifact(path,'https://fixture.example/report','text/html; charset=utf-8',len(data),digest)
            location=driver.store('fixture',artifact)
            self.assertTrue(location.endswith('.html.gz'));self.assertTrue(path.exists())
            encoded,metadata=next(iter(client.objects.values()))
            self.assertLess(len(encoded),len(data)//5);self.assertEqual(metadata['ContentEncoding'],'gzip')
            with driver.materialize(location,source_url=artifact.url) as restored:
                restored_path=restored.path
                self.assertEqual(restored.path.read_bytes(),data)
                self.assertEqual((restored.sha256,restored.size,restored.content_type),(digest,len(data),artifact.content_type))
                ExtractionService.verify_source({'sha256':digest,'sizeBytes':len(data)},restored)
                with self.assertRaisesRegex(ValueError,'checksum'):ExtractionService.verify_source({'sha256':'0'*64,'sizeBytes':len(data)},restored)
            self.assertFalse(restored_path.exists())
            self.assertEqual(driver.store('fixture',artifact),location);self.assertEqual(len(client.writes),1)

    def test_explicit_rollback_mode_keeps_original_representation(self):
        data=b'<html>'+b'evidence '*1000;digest=hashlib.sha256(data).hexdigest();client=Client();copies=[]
        driver=RawStorage(R2Storage(client,'private-fixture',dual_write=True,rollback_write=lambda key,artifact:copies.append(artifact.path.read_bytes())),None)
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'source';path.write_bytes(data)
            location=driver.store('fixture',Artifact(path,'https://fixture.example/a','text/html',len(data),digest))
        self.assertTrue(location.endswith('.html'));self.assertEqual(copies,[data])

    def test_decompression_limit_rejects_small_encoded_large_source(self):
        data=b'<html>'+b'evidence '*1000;digest=hashlib.sha256(data).hexdigest();client=Client();r2=R2Storage(client,'private-fixture')
        driver=RawStorage(r2,None)
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'source';path.write_bytes(data)
            location=driver.store('fixture',Artifact(path,'https://fixture.example/a','text/html',len(data),digest))
            r2.max_bytes=1000
            with self.assertRaisesRegex(ValueError,'Decoded source'):
                with driver.materialize(location):self.fail('Oversized decoded source yielded')
