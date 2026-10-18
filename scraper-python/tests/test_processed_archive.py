import gzip
import asyncio
import threading
import json
import pathlib
import sys
import unittest
from contextlib import asynccontextmanager
from datetime import datetime,timezone
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.processed_archive import ProcessedArchive,read_projection
from continua_scraper.r2 import R2Storage
from test_archive import MemoryClient


class ProcessedArchiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_drains_owned_storage_thread(self):
        started=threading.Event();release=threading.Event();finished=threading.Event()
        archive=ProcessedArchive(None,R2Storage(MemoryClient(),'continua-financial-documents'))
        def copy(row):
            started.set();release.wait(2);finished.set();return ('verified',)
        archive.copy=copy
        task=asyncio.create_task(archive.verified_copy({}))
        self.assertTrue(await asyncio.to_thread(started.wait,2))
        task.cancel();await asyncio.sleep(0)
        self.assertFalse(task.done())
        release.set()
        with self.assertRaises(asyncio.CancelledError):await task
        self.assertTrue(finished.is_set())

    async def test_projected_context_and_receipt_publish_in_one_transaction(self):
        row=self.row();client=MemoryClient();storage=R2Storage(client,'continua-financial-documents')
        initial=ProcessedArchive(None,storage);location,_,_,_=initial.copy(row)
        row=dict(row,payload=read_projection(row['payload']),previous_object_uri=location)
        updated_at=datetime(2026,10,18,1,tzinfo=timezone.utc)
        class DB:
            def __init__(self):self.calls=[];self.open=False
            @asynccontextmanager
            async def transaction(self):
                self.open=True
                try:yield self
                finally:self.open=False
            async def query(self,sql,args=()):
                self.assert_open()
                self.calls.append((sql,args))
                if sql.startswith('SELECT p.*'):return [row]
                if sql.startswith('UPDATE scraping.processed_research'):return [{'processed_at':updated_at}]
                return []
            def assert_open(self):
                if not self.open:raise AssertionError('Pointer update escaped its transaction')
        db=DB();archive=ProcessedArchive(db,storage)
        context={'history':[{'revenue':123.456}]}
        self.assertTrue(await archive.update_context(7,row['processor_version'],context))
        self.assertEqual(len(db.calls),3)
        self.assertEqual(json.loads(db.calls[1][1][0])['companyResearch'],context)
        self.assertEqual(db.calls[2][1][0],updated_at)

    async def test_retirement_keeps_numeric_read_model_only_after_verified_receipt(self):
        row=self.row();row['payload'].update(tables=[{'literal':'source table'}],charts=[{'points':[1,2]}],ownership=[{'name':'owner'}])
        class DB:
            def __init__(self):self.calls=[]
            @asynccontextmanager
            async def transaction(self):yield self
            async def query(self,sql,args=()):
                self.calls.append((sql,args))
                if sql.startswith('SELECT p.*'):return [row]
                if sql.startswith('INSERT INTO'):return [{'extraction_id':7}]
                return []
        db=DB();client=MemoryClient()
        result=await ProcessedArchive(db,R2Storage(client,'continua-financial-documents'),retire_payloads=True).run(1)
        self.assertEqual(result['copied'],1)
        self.assertTrue(db.calls[-1][0].startswith('UPDATE scraping.processed_research'))
        projection=json.loads(db.calls[-1][1][0])
        self.assertTrue(projection['cloudPayload']);self.assertEqual(projection['tableCount'],1)
        self.assertEqual(projection['financialFields'],row['payload']['financialFields'])
        for field in ('tables','charts','ownership'):self.assertNotIn(field,projection)
        stored=json.loads(gzip.decompress(next(iter(client.objects.values()))))
        self.assertEqual(stored['payload'],row['payload'])

    async def test_context_refresh_restores_full_object_instead_of_archiving_the_projection(self):
        row=self.row();row['payload']['tables']=[{'literal':'retain original presentation'}]
        client=MemoryClient();archive=ProcessedArchive(None,R2Storage(client,'continua-financial-documents'))
        location,_,_,_=archive.copy(row)
        projection=read_projection(row['payload']);projection['companyResearch']={'history':[{'revenue':123.456}]}
        changed=dict(row,payload=projection,previous_object_uri=location)
        new_location,_,_,full=archive.copy(changed)
        self.assertNotEqual(new_location,location)
        self.assertEqual(full['tables'],row['payload']['tables'])
        self.assertEqual(full['companyResearch'],projection['companyResearch'])
        self.assertNotIn('cloudPayload',full)

    def row(self):
        return {'extraction_id':7,'processor_version':'collected-research-v1','security_id':'NSE:KCB',
                'destination':'financials','status':'publisher_observation',
                'processed_at':datetime(2026,10,18,tzinfo=timezone.utc),
                'payload':{'financialFields':[{'metric':'revenue','value':None}],'tables':[]}}

    async def test_verified_content_is_separate_immutable_and_checkpointed(self):
        row=self.row();client=MemoryClient()
        class DB:
            def __init__(self):self.calls=[]
            @asynccontextmanager
            async def transaction(self):yield self
            async def query(self,sql,args=()):
                self.calls.append((sql,args))
                return [row] if sql.startswith('SELECT p.*') else [{'extraction_id':7}]
        db=DB();archive=ProcessedArchive(db,R2Storage(client,'continua-financial-documents'))
        self.assertEqual((await archive.run(1))['copied'],1)
        key=next(iter(client.objects))
        self.assertTrue(key.startswith('processed/research/collected-research-v1/7/'))
        snapshot=json.loads(gzip.decompress(client.objects[key]))
        self.assertEqual(snapshot['payload'],row['payload'])
        self.assertEqual(snapshot['securityId'],'NSE:KCB')
        self.assertIn('FOR UPDATE OF p SKIP LOCKED',db.calls[0][0])
        self.assertIn('AND processed_at=%s',db.calls[-1][0])
        self.assertEqual(db.calls[-1][1][-1],row['processed_at'])
        archive.copy(row);self.assertEqual(client.puts,1)

    async def test_corrupt_remote_object_never_creates_receipt(self):
        row=self.row()
        class CorruptClient(MemoryClient):
            def put_object(self,**args):
                super().put_object(**args)
                data=self.objects[args['Key']]
                self.objects[args['Key']]=b'!'*len(data)
        class DB:
            @asynccontextmanager
            async def transaction(self):yield self
            async def query(self,sql,args=()):
                if sql.startswith('SELECT p.*'):return [row]
                raise AssertionError('Unverified copy must not receive a checkpoint')
        result=await ProcessedArchive(DB(),R2Storage(CorruptClient(),'continua-financial-documents')).run(1)
        self.assertEqual(result,{'copied':0,'failed':1,'superseded':0})
