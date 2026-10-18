"""Native file-backed evidence drivers; private R2 primary and retained rollback."""
import hashlib
import gzip
import os
import pathlib
import re
import tempfile
from contextlib import contextmanager
from datetime import datetime,timezone
from urllib.parse import quote,urlsplit
from .download import Artifact
from .r2 import R2Storage,safe_key

EXTENSIONS={'application/pdf':'pdf','text/html':'html','application/json':'json','text/csv':'csv','application/xml':'xml','text/xml':'xml','image/png':'png','image/jpeg':'jpg','application/zip':'zip','application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'}

class PrivateSupabaseStorage:
    def __init__(self,origin,bucket,key,*,max_bytes=50*1024*1024,client=None):
        p=urlsplit(origin)
        # This app's configured owned project only; never derive a secret-bearing
        # destination from document URLs, query strings or operator request data.
        if p.scheme!='https' or p.netloc!='jjsetogmnumoudrovpzn.supabase.co' or p.path not in ('','/') or p.query or p.fragment:
            raise ValueError('Invalid owned storage origin')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',bucket) or not key:raise ValueError('Private rollback storage is not configured')
        import urllib3
        self.client=client or urllib3.PoolManager(num_pools=1,maxsize=1,block=True,timeout=urllib3.Timeout(connect=10,read=60),retries=False)
        self.origin,self.bucket,self.key,self.max_bytes=origin.rstrip('/'),bucket,key,max_bytes

    def _url(self,key):
        safe_key(key)
        return self.origin+'/storage/v1/object/'+quote(self.bucket,safe='')+'/'+('/'.join(quote(part,safe='') for part in key.split('/')))

    def _headers(self):return {'apikey':self.key,'Authorization':'Bearer '+self.key}

    def upload(self,key,artifact):
        if artifact.size>self.max_bytes:raise ValueError('Stored artifact exceeds response limit')
        headers=dict(self._headers(),**{'Content-Type':artifact.content_type or 'application/octet-stream','Content-Length':str(artifact.size),'x-upsert':'true'})
        with artifact.path.open('rb') as body:
            response=self.client.request('POST',self._url(key),body=body,headers=headers,redirect=False,retries=False,preload_content=False,pool_timeout=10)
            try:
                if not 200<=response.status<300:raise ValueError(f'Private rollback upload HTTP {response.status}')
                if len(response.read(1048577))>1048576:raise ValueError('Storage acknowledgement exceeds limit')
            finally:response.close();response.release_conn()

    @contextmanager
    def materialize(self,key,*,source_url=None):
        response=self.client.request('GET',self._url(key),headers=self._headers(),redirect=False,retries=False,preload_content=False,pool_timeout=10)
        try:
            if response.status!=200:raise ValueError(f'Private artifact read HTTP {response.status}')
            length=response.headers.get('Content-Length')
            if length is not None and (not str(length).isdigit() or int(length)>self.max_bytes):raise ValueError('Stored artifact exceeds response limit')
            expected=key.rsplit('/',1)[-1].split('.')[0]
            with tempfile.TemporaryDirectory(prefix='continua-private-read-') as directory:
                path=pathlib.Path(directory)/'artifact';digest,total=hashlib.sha256(),0
                with path.open('xb') as body:
                    while chunk:=response.read(65536,decode_content=False):
                        from .transfer_budget import account
                        account('downloadBytes',len(chunk))
                        total+=len(chunk)
                        if total>self.max_bytes:raise ValueError('Stored artifact exceeds response limit')
                        body.write(chunk);digest.update(chunk)
                actual=digest.hexdigest()
                if (length is not None and total!=int(length)) or (re.fullmatch(r'[a-f0-9]{64}',expected) and actual!=expected):raise ValueError('Private artifact verification failed')
                response.close();response.release_conn()
                yield Artifact(path,source_url or key,response.headers.get('Content-Type') or 'application/octet-stream',total,actual)
        finally:response.close();response.release_conn()

    def close(self):self.client.clear()

class RawStorage:
    def __init__(self,r2,rollback):self.r2,self.rollback=r2,rollback

    @classmethod
    def from_environment(cls):
        if (os.environ.get('RENDER')=='true' or os.environ.get('RENDER_SERVICE_ID') or os.environ.get('NODE_ENV')=='production') and os.environ.get('RAW_STORAGE_DRIVER')!='r2':
            raise ValueError('Production/Render evidence storage must use private R2; local storage is disabled')
        rollback=None
        # The legacy reader remains available for migration, but a configured
        # service key alone must never enable duplicate uploads.
        dual_write=os.environ.get('R2_DUAL_WRITE','false').lower() in ('true','1','yes')
        if dual_write:
            raise ValueError('Supabase file writes are disabled; set R2_DUAL_WRITE=false')
        if dual_write or os.environ.get('SUPABASE_SERVICE_ROLE_KEY'):
            rollback=PrivateSupabaseStorage(os.environ.get('SUPABASE_URL',''),'scraper-raw' if not os.environ.get('SUPABASE_STORAGE_BUCKET') else os.environ['SUPABASE_STORAGE_BUCKET'],os.environ.get('SUPABASE_SERVICE_ROLE_KEY',''))
        try:r2=R2Storage.from_environment(rollback_write=rollback.upload if rollback and dual_write else None)
        except BaseException:
            if rollback:rollback.close()
            raise
        return cls(r2,rollback)

    def store(self,source_id,artifact):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',source_id):raise ValueError('Invalid artifact source ID')
        ext=EXTENSIONS.get((artifact.content_type or '').split(';')[0].strip(),'bin')
        key=f'{source_id}/{datetime.now(timezone.utc).year}/{artifact.sha256}.{ext}'
        if ext in ('html','json','csv','xml') and artifact.size>=4096 and not self.r2.dual_write:
            # Compress the representation, never rewrite source bytes or their
            # provenance hash. R2 verifies encoded bytes; reprocessing verifies
            # the exact decoded source against the immutable database record.
            with tempfile.TemporaryDirectory(prefix='continua-r2-encode-') as directory:
                path=pathlib.Path(directory)/'source.gz';original_digest=hashlib.sha256();original_size=0
                with artifact.path.open('rb') as source,path.open('xb') as body,gzip.GzipFile(fileobj=body,mode='wb',filename='',mtime=0,compresslevel=6) as compressed:
                    while chunk:=source.read(65536):
                        original_size+=len(chunk)
                        if original_size>self.r2.max_bytes:raise ValueError('Source compression input exceeds limit')
                        original_digest.update(chunk);compressed.write(chunk)
                if original_size!=artifact.size or original_digest.hexdigest()!=artifact.sha256:raise ValueError('Source changed during compression')
                size=path.stat().st_size
                if size<artifact.size:
                    digest=hashlib.sha256()
                    with path.open('rb') as body:
                        while chunk:=body.read(65536):digest.update(chunk)
                    encoded_hash=digest.hexdigest()
                    encoded_key=f'{source_id}/{datetime.now(timezone.utc).year}/{encoded_hash}.{ext}.gz'
                    return self.r2.upload(encoded_key,Artifact(path,artifact.url,artifact.content_type,size,encoded_hash,'gzip'))
        return self.r2.upload(key,artifact)

    def materialize(self,location,*,source_url=None):
        if location.startswith('r2://'):
            key=self.r2.key_from_location(location)
            if len(key.split('/'))==3 and key.endswith(('.html.gz','.json.gz','.csv.gz','.xml.gz')):
                return self._decoded(key,source_url)
            return self.r2.materialize(key,source_url=source_url)
        if self.rollback is None:raise ValueError('Legacy private artifact reader is not configured')
        return self.rollback.materialize(safe_key(location.replace('\\','/')),source_url=source_url)

    @contextmanager
    def _decoded(self,key,source_url):
        with self.r2.materialize(key,source_url=source_url) as encoded:
            with tempfile.TemporaryDirectory(prefix='continua-r2-decode-') as directory:
                path=pathlib.Path(directory)/'source';digest=hashlib.sha256();total=0
                with gzip.open(encoded.path,'rb') as source,path.open('xb') as output:
                    while chunk:=source.read(65536):
                        total+=len(chunk)
                        if total>self.r2.max_bytes:raise ValueError('Decoded source exceeds limit')
                        digest.update(chunk);output.write(chunk)
                yield Artifact(path,source_url or encoded.url,encoded.content_type,total,digest.hexdigest())

    def close(self):
        try:self.r2.close()
        finally:
            if self.rollback:self.rollback.close()
