import hashlib
import pathlib
import sys
import unittest
import json
import tempfile
from contextlib import asynccontextmanager
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from migrate_media import legacy_identity,object_key,raster,publish,ORIGIN,PROJECT

class MediaMigrationTests(unittest.TestCase):
    def test_only_exact_owned_public_media_urls_are_rewritten(self):
        url='https://jjsetogmnumoudrovpzn.supabase.co/storage/v1/object/public/avatars/owner/a%20b.png'
        self.assertEqual(legacy_identity(url),('avatars','owner/a b.png'))
        for other in [None,'https://evil.example'+url.split('.co',1)[1],url+'?token=secret',url+'#fragment',url.replace('/avatars/','/scraper-raw/'),url.replace('https:','http:')]:
            self.assertIsNone(legacy_identity(other))

    def test_deterministic_copy_identity_preserves_owner_and_exact_source_bytes(self):
        png=b'\x89PNG\r\n\x1a\nfixture';owner='11111111-1111-4111-8111-111111111111'
        key,digest=object_key('avatars',owner+'/old.png',png)
        self.assertEqual((key,digest),object_key('avatars',owner+'/old.png',png))
        self.assertTrue(key.startswith('avatars/'+owner+'/'));self.assertTrue(key.endswith('-'+hashlib.sha256(png).hexdigest()+'.png'))
        self.assertNotEqual(key,object_key('avatars',owner+'/different.png',png)[0])
        with self.assertRaises(ValueError):object_key('avatars','unknown-owner/old.png',png)
        with self.assertRaises(ValueError):object_key('scraper-raw',owner+'/old.png',png)
        with self.assertRaises(ValueError):raster(b'<svg>script</svg>')

class MediaPublishTests(unittest.IsolatedAsyncioTestCase):
    async def test_cloud_corruption_never_changes_database_and_verified_publish_is_idempotent(self):
        owner='11111111-1111-4111-8111-111111111111';data=b'\x89PNG\r\n\x1a\nfixture'
        legacy=owner+'/old.png';key,digest=object_key('avatars',legacy,data)
        class DB:
            def __init__(self):self.calls=[];self.avatar=PROJECT+'/storage/v1/object/public/avatars/'+legacy
            @asynccontextmanager
            async def transaction(self):yield self
            async def query(self,sql,args=()):
                self.calls.append(sql)
                if sql.startswith('SELECT id,avatar_url'):return [{'id':'profile','avatar_url':self.avatar,'banner_url':None}]
                if sql.startswith('SELECT id,image_url'):return []
                if sql.startswith('UPDATE public.profiles'):self.avatar=args[0]
                return []
        class Response:
            status=200
            def read(self,*args,**kwargs):return self.body
            def close(self):pass
            def release_conn(self):pass
        class Client:
            body=b'corrupt'
            def request(self,*args,**kwargs):response=Response();response.body=self.body;return response
            def clear(self):pass
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);path=root/key;path.parent.mkdir(parents=True);path.write_bytes(data)
            (root/'manifest.json').write_text(json.dumps({'schemaVersion':1,'origin':ORIGIN,'entries':[{'bucket':'avatars','legacyKey':legacy,'key':key,'sha256':digest,'size':len(data)}]}))
            db=DB();client=Client()
            with patch('urllib3.PoolManager',return_value=client):
                with self.assertRaisesRegex(ValueError,'verification'):await publish(db,root)
                self.assertEqual(db.calls,[])
                client.body=data
                self.assertEqual((await publish(db,root))['profiles'],1)
                self.assertEqual(db.avatar,ORIGIN+'/media/'+key)
                self.assertEqual((await publish(db,root))['profiles'],0)
                self.assertTrue(path.exists())

if __name__=='__main__':unittest.main()
