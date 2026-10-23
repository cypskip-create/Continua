import asyncio
import hashlib
import gzip
import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import contextmanager
from datetime import datetime,timezone
from decimal import Decimal
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.archive import R2Archive,snapshot_json,read_snapshot
from continua_scraper.download import Artifact
from continua_scraper.r2 import R2Storage

class MemoryClient:
    def __init__(self):self.objects={};self.puts=0
    def head_object(self,**args):
        if args['Key'] not in self.objects:
            error=RuntimeError('fixture missing');error.response={'ResponseMetadata':{'HTTPStatusCode':404}};raise error
        return {'ContentLength':len(self.objects[args['Key']])}
    def put_object(self,**args):self.objects[args['Key']]=args['Body'].read();self.puts+=1
    def get_object(self,**args):
        data=self.objects[args['Key']]
        return {"Body":io.BytesIO(data),"ContentLength":len(data)}

class DB:
    def __init__(self,row,*,superseded=False):self.row=row;self.calls=[];self.superseded=superseded
    async def query(self,sql,args=()):
        self.calls.append((sql,args))
        if 'SELECT a.*,e.id AS extraction_id' in sql:return [self.row]
        if sql.startswith("SELECT * FROM scraping.extractions"):return [{"id":7,"artifact_id":1,"text":"source evidence","confidence":Decimal("0.8"),"extracted_at":datetime(2026,10,13,tzinfo=timezone.utc)}]
        if "RETURNING id" in sql:return [] if self.superseded else [{"id":1}]
        return []

class ArchiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_raw_and_snapshot_verified_before_compare_and_set(self):
        data=b"%PDF-evidence";digest=hashlib.sha256(data).hexdigest()
        row={"id":1,"source_id":"source","document_url":"https://fixture.example/a.pdf","storage_path":f"source/2026/{digest}.pdf","sha256":digest,"size_bytes":len(data),"extraction_id":7}
        with tempfile.TemporaryDirectory(prefix="continua-archive-test-") as directory:
            path=pathlib.Path(directory)/"original.pdf";path.write_bytes(data)
            @contextmanager
            def legacy_reader(old):yield Artifact(path,row['document_url'],"application/pdf",len(data),digest)
            client=MemoryClient();db=DB(row);archive=R2Archive(db,R2Storage(client,"private-fixture"),legacy_reader)
            result=await archive.run(1)
            self.assertEqual(result,{"copied":1,"failed":0,"superseded":0})
            self.assertEqual(client.puts,2)
            sql,args=db.calls[-1]
            self.assertIn("storage_path=%s",sql)
            self.assertIn("COALESCE(metadata->>'r2ExtractionId','')=%s RETURNING id",sql)
            self.assertIn('INSERT INTO scraping.extraction_cloud_archive',sql)
            self.assertIn('SELECT id FROM updated',sql)
            self.assertEqual(args[3],row['storage_path'])
            self.assertEqual(args[4],"")
            metadata=json.loads(args[1]);self.assertEqual(metadata['r2ExtractionId'],'7')
            self.assertEqual(metadata['r2LegacyStoragePath'],row['storage_path'])
            self.assertEqual(args[5],7)
            self.assertEqual(args[6],metadata['r2ExtractionObject'])
            self.assertEqual(args[7],hashlib.sha256(client.objects[args[6].split('private-fixture/',1)[1]]).hexdigest())
            self.assertTrue(path.exists())
            snapshot=json.loads(gzip.decompress(next(v for k,v in client.objects.items() if k.endswith('.json.gz'))))
            self.assertEqual(metadata['r2ExtractionFormat'],'gzip-json-v1')
            self.assertEqual(snapshot['extraction']['confidence'],.8)
            self.assertEqual(snapshot['extraction']['extracted_at'],'2026-10-13T00:00:00.000Z')
            await archive.close()

    async def test_compressed_snapshot_restores_exact_evidence_and_reuses_object(self):
        client=MemoryClient();archive=R2Archive(None,R2Storage(client,'private-fixture'),None)
        row={'id':1,'source_id':'fixture','document_url':'https://fixture.example/a.pdf'}
        snapshot={'id':7,'text':'literal financial evidence '*10000,'needs_review':True}
        first=archive._copy_snapshot(row,'fixture/original.pdf',snapshot)
        second=archive._copy_snapshot(row,'fixture/original.pdf',snapshot)
        self.assertEqual(first,second);self.assertEqual(client.puts,1)
        payload=next(iter(client.objects.values()))
        self.assertLess(len(payload),len(snapshot['text'])//5)
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'snapshot.json.gz';path.write_bytes(payload)
            self.assertEqual(read_snapshot(path,format='gzip-json-v1')['extraction'],snapshot)
            with self.assertRaisesRegex(ValueError,'Decoded snapshot'):read_snapshot(path,format='gzip-json-v1',max_bytes=100)
            plain=pathlib.Path(directory)/'retained.json';plain.write_bytes(gzip.decompress(payload))
            self.assertEqual(read_snapshot(plain)['extraction'],snapshot)

    async def test_failed_or_concurrently_updated_source_never_claims_copy(self):
        row={"id":1,"source_id":"source","document_url":"https://fixture.example/a.pdf","storage_path":"r2://private-fixture/source/old.pdf","extraction_id":None}
        db=DB(row,superseded=True);archive=R2Archive(db,R2Storage(MemoryClient(),"private-fixture"),None)
        self.assertEqual((await archive.run(1))['superseded'],1)
        row['storage_path']='r2://different-bucket/a.pdf'
        self.assertEqual((await archive.run(1))['failed'],1)
        self.assertIn('storage_path=%s',db.calls[-1][0])
        self.assertIn('r2ArchiveRetryAt',db.calls[-1][1][0])
        await archive.close()

    async def test_cataloguing_older_version_preserves_latest_pointer(self):
        client=MemoryClient();digest=hashlib.sha256(b'raw').hexdigest()
        row={'id':1,'source_id':'source','document_url':'https://fixture.example/a.pdf',
             'storage_path':f'r2://private-fixture/source/{digest}.pdf','extraction_id':7,
             'metadata':{'r2ExtractionId':'9','r2ExtractionObject':'latest-retained-object'}}
        db=DB(row);archive=R2Archive(db,R2Storage(client,'private-fixture'),None)
        self.assertEqual((await archive.run(1))['copied'],1)
        sql,args=db.calls[-1];metadata=json.loads(args[1])
        self.assertNotIn('r2ExtractionId',metadata)
        self.assertNotIn('r2ExtractionObject',metadata)
        self.assertEqual(args[4],'9');self.assertEqual(args[5],7)
        self.assertIn('/extractions/',args[6])
        self.assertIn('NOT EXISTS(SELECT 1 FROM scraping.extraction_cloud_archive',db.calls[0][0])
        await archive.close()

    async def test_singleflight_and_request_cancellation_keep_active_job(self):
        event=asyncio.Event();calls=[]
        archive=R2Archive(None,None,None)
        async def work(limit):calls.append(limit);await event.wait();return {"copied":0}
        archive._run=work
        first=asyncio.create_task(archive.run(1));await asyncio.sleep(0)
        second=asyncio.create_task(archive.run(2));await asyncio.sleep(0)
        first.cancel()
        with self.assertRaises(asyncio.CancelledError):await first
        self.assertFalse(archive._task.cancelled())
        event.set();self.assertEqual(await second,{"copied":0});self.assertEqual(calls,[1])
        await archive.close()
        with self.assertRaises(RuntimeError):await archive.run()

    async def test_disabled_and_limit_validation(self):
        archive=R2Archive(None,None,None,enabled=False)
        self.assertTrue((await archive.run())['disabled'])
        archive.enabled=True
        for limit in [True,0,21,1.5]:
            with self.assertRaises(ValueError):await archive.run(limit)
        with self.assertRaises(ValueError):snapshot_json({'timestamp':datetime(2026,1,1)})

    async def test_steady_state_archives_r2_snapshots_without_legacy_reads(self):
        digest=hashlib.sha256(b'evidence').hexdigest()
        key=f'source/2026/{digest}.pdf'
        row={'id':1,'source_id':'source','document_url':'https://fixture.example/a.pdf','storage_path':'r2://private-fixture/'+key,'sha256':digest,'size_bytes':8,'extraction_id':7}
        def forbidden_legacy_reader(path):raise AssertionError('Steady-state archival accessed Supabase files')
        db=DB(row);archive=R2Archive(db,R2Storage(MemoryClient(),'private-fixture'),forbidden_legacy_reader,include_legacy=False)
        self.assertEqual((await archive.run(1))['copied'],1)
        self.assertEqual(db.calls[0][1],(False,1))
        self.assertNotIn('storage.objects',db.calls[0][0])
        with self.assertRaisesRegex(ValueError,'Legacy file reads are disabled'):
            archive._copy_raw(dict(row,storage_path=key))
        await archive.close()

    async def test_budget_pause_is_not_raised_again_during_graceful_shutdown(self):
        from continua_scraper.transfer_budget import TransferLimitReached
        archive=R2Archive(None,None,None)
        async def paused(limit):raise TransferLimitReached()
        archive._run=paused
        with self.assertRaises(TransferLimitReached):await archive.run(1)
        await archive.close()

if __name__=="__main__":unittest.main()
