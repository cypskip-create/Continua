"""Prepare legacy public images; publish references only after cloud verification.

No source objects are deleted. This operator tool never creates credentials,
changes bucket access, uploads private evidence or invents account ownership.
"""
import argparse
import asyncio
import hashlib
import json
import os
import pathlib
import re
import uuid
from urllib.parse import unquote,urlsplit
from continua_scraper.database import Database
from continua_scraper.event_loop import database_event_loop
from continua_scraper.storage import PrivateSupabaseStorage
from continua_scraper import transfer_budget
from scheduled_collect import scheduled_slot

ORIGIN='https://continua-preview.cypriankiprop41.workers.dev'
PROJECT='https://jjsetogmnumoudrovpzn.supabase.co'
KINDS=('avatars','banners','post-images')
MAX_BYTES=5*1024*1024

def raster(data):
    if data.startswith(b'\xff\xd8\xff'):return 'jpg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):return 'png'
    if data[:4]==b'RIFF' and data[8:12]==b'WEBP':return 'webp'
    if data[:6] in (b'GIF87a',b'GIF89a'):return 'gif'
    raise ValueError('Unsupported legacy image')

def legacy_identity(value):
    if not isinstance(value,str):return None
    try:
        parsed=urlsplit(value)
        if parsed.scheme!='https' or parsed.netloc!='jjsetogmnumoudrovpzn.supabase.co' or parsed.query or parsed.fragment:return None
        prefix='/storage/v1/object/public/'
        if not parsed.path.startswith(prefix):return None
        bucket,separator,key=unquote(parsed.path[len(prefix):]).partition('/')
        if not separator or bucket not in KINDS:return None
        return bucket,key
    except ValueError:return None

def object_key(bucket,key,data):
    owner=key.split('/')[0]
    if bucket not in KINDS or not re.fullmatch(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}',owner):raise ValueError('Legacy image owner requires review')
    digest=hashlib.sha256(data).hexdigest()
    identity=uuid.uuid5(uuid.NAMESPACE_URL,PROJECT+'/'+bucket+'/'+key)
    return f'{bucket}/{owner}/{identity}-{digest}.{raster(data)}',digest

async def prepare(database,directory):
    rows=await database.query("SELECT bucket_id,name FROM storage.objects WHERE bucket_id=ANY(%s::text[]) ORDER BY bucket_id,name",(list(KINDS),))
    if len(rows)>100:raise ValueError('Legacy media batch exceeds reviewed inventory')
    directory=directory.resolve();directory.mkdir(parents=True,exist_ok=True)
    readers={kind:PrivateSupabaseStorage(PROJECT,kind,os.environ['SUPABASE_SERVICE_ROLE_KEY'],max_bytes=MAX_BYTES) for kind in KINDS}
    entries=[]
    try:
        for row in rows:
            reader=readers[row['bucket_id']]
            def read():
                with reader.materialize(row['name']) as artifact:return artifact.path.read_bytes()
            data=await asyncio.to_thread(read)
            target,digest=object_key(row['bucket_id'],row['name'],data)
            path=directory.joinpath(*target.split('/')).resolve()
            if not path.is_relative_to(directory):raise ValueError('Invalid local media path')
            path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Local image conflict')
            path.write_bytes(data)
            entries.append({'bucket':row['bucket_id'],'legacyKey':row['name'],'key':target,'sha256':digest,'size':len(data)})
        (directory/'manifest.json').write_text(json.dumps({'schemaVersion':1,'origin':ORIGIN,'entries':entries},separators=(',',':')),encoding='utf-8')
    finally:
        for reader in readers.values():reader.close()
    return {'prepared':len(entries),'bytes':sum(row['size'] for row in entries),'sourceObjectsDeleted':0}

async def publish(database,directory):
    if (directory/'manifest.json').stat().st_size>262144:raise ValueError('Media manifest exceeds limit')
    manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('schemaVersion')!=1 or manifest.get('origin')!=ORIGIN or not isinstance(manifest.get('entries'),list) or len(manifest['entries'])>100:raise ValueError('Invalid media manifest')
    # Reconstruct and verify every object against its local prepared source.
    import urllib3
    client=urllib3.PoolManager(num_pools=1,maxsize=1,timeout=urllib3.Timeout(connect=10,read=30),retries=False)
    replacements={}
    try:
        for row in manifest['entries']:
            local=directory.joinpath(*row['key'].split('/')).resolve()
            if not local.is_relative_to(directory.resolve()):raise ValueError('Invalid manifest path')
            if not 1<=local.stat().st_size<=MAX_BYTES:raise ValueError('Prepared image exceeds limit')
            data=local.read_bytes()
            key,digest=object_key(row['bucket'],row['legacyKey'],data)
            if key!=row['key'] or digest!=row['sha256'] or len(data)!=row['size']:raise ValueError('Prepared image changed')
            def verify():
                response=client.request('GET',ORIGIN+'/media/'+key,redirect=False,retries=False,preload_content=False)
                try:
                    if response.status!=200:raise ValueError('Cloud media not ready')
                    body=response.read(MAX_BYTES+1,decode_content=False)
                    transfer_budget.account('downloadBytes',len(body))
                    if len(body)!=len(data) or hashlib.sha256(body).hexdigest()!=digest:raise ValueError('Cloud media verification failed')
                finally:response.close();response.release_conn()
            await asyncio.to_thread(verify)
            replacements[(row['bucket'],row['legacyKey'])]=ORIGIN+'/media/'+key
    finally:client.clear()
    replace=lambda value:replacements.get(legacy_identity(value),value)
    changes={'profiles':0,'posts':0,'verifiedObjects':len(replacements),'sourceObjectsDeleted':0}
    # All cloud bytes are verified before one atomic, owner-row-locked update.
    # Current values are read under locks; concurrent edits are never overwritten.
    async with database.transaction() as tx:
        profiles=await tx.query('SELECT id,avatar_url,banner_url FROM public.profiles WHERE avatar_url IS NOT NULL OR banner_url IS NOT NULL LIMIT 1001 FOR UPDATE')
        posts=await tx.query("SELECT id,image_url,image_urls FROM public.posts WHERE image_url IS NOT NULL OR cardinality(image_urls)>0 LIMIT 1001 FOR UPDATE")
        if len(profiles)>1000 or len(posts)>1000:raise ValueError('Media reference batch requires pagination')
        for row in profiles:
            avatar,banner=replace(row['avatar_url']),replace(row['banner_url'])
            if (avatar,banner)!=(row['avatar_url'],row['banner_url']):
                await tx.query('UPDATE public.profiles SET avatar_url=%s,banner_url=%s WHERE id=%s',(avatar,banner,row['id']));changes['profiles']+=1
        for row in posts:
            image,images=replace(row['image_url']),[replace(value) for value in row['image_urls'] or []]
            if image!=row['image_url'] or images!=(row['image_urls'] or []):
                await tx.query('UPDATE public.posts SET image_url=%s,image_urls=%s::text[] WHERE id=%s',(image,images,row['id']));changes['posts']+=1
    return changes

async def run(mode,directory):
    database=await Database.open(os.environ['DATABASE_URL']);budget=transfer_budget.TransferBudget(16*1024**2)
    run_id='cloud-media-'+mode+'-'+uuid.uuid4().hex
    try:
        async with scheduled_slot(database,run_id,'drain',budget.limit,192*1024**2) as skipped:
            if skipped:return {'status':skipped}
            transfer_budget.active=budget
            result=await (prepare(database,directory) if mode=='prepare' else publish(database,directory))
            result.update(budget.snapshot(),status='completed')
            await database.query("UPDATE scraping.scheduled_runs SET status='completed',completed_at=now(),receipt=%s::jsonb WHERE id=%s",(json.dumps(result),run_id))
            return result
    finally:transfer_budget.active=None;await database.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['prepare','publish']);parser.add_argument('--directory',type=pathlib.Path,required=True)
    args=parser.parse_args()
    try:print(json.dumps(asyncio.run(run(args.mode,args.directory),loop_factory=database_event_loop)))
    except Exception as error:
        print(json.dumps({'status':'failed','errorClass':type(error).__name__,'privateDetailsOmitted':True}));raise SystemExit(1)
