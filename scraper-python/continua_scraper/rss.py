"""Native RSS/Atom adapter. Feed discovery and source-allowed article evidence."""
import hashlib
import pathlib
import tempfile
from datetime import datetime,timezone
from .download import Artifact, SourceHTTPError
from .html import normalize_feed_summary,article_body_text,article_image

def feed_documents(text,feed_url,max_items=50):
    import feedparser
    if len(text.encode('utf-8'))>8*1024*1024:raise ValueError('Feed parser input exceeds limit')
    # Pass bytes, not a URL: feedparser is not allowed to perform network I/O.
    feed=feedparser.parse(text.encode('utf-8'))
    if feed.get('bozo') and not feed.get('entries'):raise ValueError('Invalid publisher feed')
    def published(item):
        parts=item.get('published_parsed') or item.get('updated_parsed')
        try:return datetime(*parts[:6],tzinfo=timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z') if parts else None
        except (TypeError,ValueError):return None
    items=list(feed.get('entries') or [])
    items.sort(key=lambda item:published(item) or '',reverse=True)
    result=[]
    for item in items:
        if not item.get('link'):continue
        content=item.get('summary') or (item.get('content') or [{}])[0].get('value')
        result.append({'url':item['link'],'title':item.get('title'),'discoveredFrom':feed_url,
            'context':{'publishedAt':published(item) or item.get('published') or item.get('updated'),
            'author':item.get('author'),'guid':item.get('id'),'categories':[v['term'] for v in item.get('tags',[]) if v.get('term')],
            'feedSummary':normalize_feed_summary(content)}})
        if len(result)>=max_items:break
    return result

class RssAdapter:
    document_newest_first=True
    parser_version=None # Preserve existing reusable news extraction behavior.
    def __init__(self,io):
        self.io=io;self.id=io.source['id'];config=io.source['config']
        self.feed_url=config.get('feedUrl')
        if not isinstance(self.feed_url,str) or not self.feed_url:raise ValueError('RSS source requires config.feedUrl')
        self.document_concurrency=config.get('concurrency',2)
        self.max_items=max(1,min(int(config.get('maxItemsPerRun',50)),200))

    async def discover(self):
        if not await self.io.downloader.robots_allowed(self.feed_url):return []
        artifact=await self.io.downloader.fetch(self.feed_url)
        try:return feed_documents(self.io.text(artifact),self.feed_url,self.max_items)
        finally:artifact.path.unlink(missing_ok=True)

    async def fetch(self,document):
        context=document.get('context') or {}
        if not await self.io.downloader.robots_allowed(document['url']):
            return await self.feed_summary(document,articleRobotsAllowed=False)
        try:
            return await self.io.fetch_document(document,'rss','scraper-phase7-0.1.0',published_at=context.get('publishedAt'))
        except SourceHTTPError as error:
            # A publisher feed is independently obtained evidence. Never bypass
            # article access controls or retry deleted/forbidden articles forever.
            # Infrastructure/transient errors still fail and retain their retry path.
            if error.status not in (403,404,410):raise
            if not (context.get('feedSummary') or '').strip():raise
            return await self.feed_summary(document,articleRobotsAllowed=True,articleHTTPStatus=error.status)

    async def feed_summary(self,document,**availability):
        context=document.get('context') or {}
        summary=(context.get('feedSummary') or '').strip()
        if not summary:raise PermissionError('Article unavailable and no public feed summary exists')
        data=summary.encode('utf-8')
        file=tempfile.NamedTemporaryFile(prefix='continua-rss-summary-',suffix='.raw',delete=False)
        with file:file.write(data)
        artifact=Artifact(pathlib.Path(file.name),document['url'],'text/plain; charset=utf-8',len(data),hashlib.sha256(data).hexdigest())
        try:
            return await self.io.persist(document,artifact,'rss','scraper-phase7-0.1.0',published_at=context.get('publishedAt'),metadata=dict(context,contentSource='rss_summary',evidenceUrl=self.feed_url,**availability))
        except BaseException:
            artifact.path.unlink(missing_ok=True)
            raise

    async def parse(self,fetched):
        content_type=fetched.get('contentType') or ''
        entity={'companyName':None,'ticker':None,'exchange':'N/A','imageUrl':None}
        if 'text/plain' in content_type:
            text=self.io.text(fetched['artifact']).strip()
            return {'method':'html','confidence':.5 if len(text)>=100 else .25,'text':text or None,'tables':[],'entity':entity,'needsReview':len(text)<100}
        if 'text/html' not in content_type:
            return {'method':'html','confidence':None,'text':None,'tables':[],'entity':entity,'needsReview':True}
        html=self.io.text(fetched['artifact']);text=article_body_text(html);usable=len(text)>=100
        entity['imageUrl']=article_image(html,fetched['document']['url'])
        return {'method':'html','confidence':.6 if usable else .1,'text':text if usable else None,'tables':[],'entity':entity,'needsReview':not usable}
