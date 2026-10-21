"""Shared native adapter storage path, preserving source and immutable evidence."""
import asyncio
import pathlib
from urllib.parse import urlsplit
from .download import cache_validator

class AdapterIO:
    def __init__(self,source,downloader,storage,evidence):
        self.source,self.downloader,self.storage,self.evidence=source,downloader,storage,evidence

    async def persist(self,document,artifact,adapter,version,*,metadata=None,published_at=None):
        try:
            # Shield a single bounded storage call. Caller cancellation waits for
            # its I/O thread before deleting the file it still reads.
            task=asyncio.create_task(asyncio.to_thread(self.storage.store,self.source['id'],artifact))
            try:location=await asyncio.shield(task)
            except asyncio.CancelledError:
                try:await task
                finally:raise
            stored_metadata=dict(metadata if metadata is not None else document.get('context') or {})
            stored_metadata['requestedUrl']=document['url']
            if urlsplit(document['url']).netloc==urlsplit(artifact.url).netloc:
                for key,attribute in (('httpEtag','http_etag'),('httpLastModified','http_last_modified')):
                    value=cache_validator(getattr(artifact,attribute,None))
                    if value:stored_metadata[key]=value
            if location.endswith(('.html.gz','.json.gz','.csv.gz','.xml.gz')):stored_metadata['r2StoredRepresentation']='gzip-source-v1'
            saved=await self.evidence.upsert_artifact({'sourceId':self.source['id'],'adapter':adapter,'sha256':artifact.sha256,
                'documentUrl':artifact.url,'sourceUrl':document.get('discoveredFrom'),'contentType':artifact.content_type,'sizeBytes':artifact.size,
                'storagePath':location,'title':document.get('title'),'publishedAt':published_at,'crawlerVersion':version,
                'metadata':stored_metadata})
            return {'document':document,'artifact':artifact,'sha256':artifact.sha256,'contentType':artifact.content_type,'sizeBytes':artifact.size,
                'storagePath':location,'isNewArtifact':saved['isNew'],'artifactId':saved['artifact']['id'],'cleanup':lambda:artifact.path.unlink(missing_ok=True)}
        except BaseException:
            artifact.path.unlink(missing_ok=True)
            raise

    async def fetch_document(self,document,adapter,version,*,published_at=None):
        headers={}
        if (self.source.get('config') or {}).get('conditionalRequests') is True:
            previous=await self.evidence.latest_artifact_by_url(self.source['id'],document['url'])
            for header,key in (('If-None-Match','httpEtag'),('If-Modified-Since','httpLastModified')):
                value=cache_validator((previous or {}).get('metadata',{}).get(key))
                if value:headers[header]=value
        artifact=await self.downloader.fetch(document['url'],request_headers=headers) if headers else await self.downloader.fetch(document['url'])
        return await self.persist(document,artifact,adapter,version,published_at=published_at)

    @staticmethod
    def text(artifact,limit=8*1024*1024):
        if artifact.size>limit:raise ValueError('Text parser input exceeds limit')
        with artifact.path.open('rb') as body:data=body.read(limit+1)
        if len(data)>limit:raise ValueError('Text parser input exceeds limit')
        return data.decode('utf-8',errors='replace')
