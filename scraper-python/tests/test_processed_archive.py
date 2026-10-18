import gzip
import json
import pathlib
import sys
import unittest
from contextlib import asynccontextmanager
from datetime import datetime,timezone
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.processed_archive import ProcessedArchive
from continua_scraper.r2 import R2Storage
from test_archive import MemoryClient


class ProcessedArchiveTests(unittest.IsolatedAsyncioTestCase):
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
