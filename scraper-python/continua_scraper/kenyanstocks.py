"""All observed issuer views/files, with independent durable jobs and attribution."""
import hashlib
import pathlib
import re
import tempfile
from urllib.parse import urlsplit
from .download import Artifact
from .html import soup,resolve_url,kenyan_stock_links,kenyan_file_links,kenyan_news_cards
from .tables import stock_tables,html_financial_tables,publisher_view
from .tabs import stock_tab_documents

def parse_publisher_view(html,context,url):
    doc=soup(html)
    for node in doc.select('script,style,nav,header,footer,noscript'):node.decompose()
    text='\n'.join(line.strip() for line in (doc.body.get_text() if doc.body else '').split('\n') if line.strip()).strip()
    tab=str(context.get('tab') or 'Summary');category=context.get('category')
    tables=stock_tables(html,tab,category if isinstance(category,str) else None)+html_financial_tables(html)
    news=kenyan_news_cards(html,url)
    if news['entries']:tables.append(news)
    tables.append(publisher_view(html,url))
    return {'method':'html','confidence':.4 if len(text)>=200 else .1,'text':text if len(text)>=200 else None,'tables':tables,
        'entity':{'companyName':None,'ticker':context.get('ticker'),'exchange':'NSE'},'needsReview':True}

class KenyanStocksAdapter:
    document_concurrency=1
    persistent_batch_size=10
    parser_version='kenyanstocks-adapter-0.5.0'
    scope_extractions_by_ticker=True
    claim_lanes=('Financials','Financials','Financials','Financials','Financials','Summary','Statistics','News','Corporate Actions','Historical Data','Holders','Files','PDF')
    def __init__(self,io,jobs,renderer,pdf,*,universe=()):
        self.io,self.jobs,self.renderer,self.pdf=io,jobs,renderer,pdf;self.id=io.source['id']
        aliases={'DTB':'DTK','STANBIC':'SBIC','HFCB':'HFCK'}
        configured=(io.source.get('config') or {}).get('tickers',[])
        self.tickers=list(dict.fromkeys(aliases.get(t.upper(),t.upper()) for t in [*configured,*universe] if isinstance(t,str) and re.fullmatch(r'[A-Za-z0-9-]+',t)))

    async def discover_issuer_financials(self,ticker):
        if ticker not in self.tickers:raise ValueError('Issuer is not registered for this source')
        return stock_tab_documents('https://kenyanstocks.com/stock/nse/'+ticker,['Financials'])

    async def _discovery_page(self,url):
        rendered=await self.renderer.render(url,discovery=True)
        if (rendered.get('coverage') or {}).get('scrollLimitReached'):
            raise ValueError('Publisher listing discovery incomplete')
        body=rendered['html'].encode('utf-8')
        file=tempfile.NamedTemporaryFile(prefix='continua-discovery-',suffix='.raw',delete=False)
        path=pathlib.Path(file.name)
        try:
            with file:file.write(body)
            artifact=Artifact(path,rendered['finalUrl'],'text/html; charset=utf-8',len(body),hashlib.sha256(body).hexdigest())
            await self.io.persist({'url':url,'context':{'discoveryIndex':True}},artifact,'kenyanstocks',self.parser_version,
                metadata={'discoveryIndex':True,'renderedWithBrowser':True,'coverage':rendered.get('coverage')})
            return rendered['html']
        finally:path.unlink(missing_ok=True)

    async def discover(self):
        base='https://kenyanstocks.com';home=''
        self.discovery_coverage={'listingFailures':0,'listedStocks':0,'queuedStocks':0,'plannedViews':0}
        if await self.io.downloader.robots_allowed(base):
            try:home=await self._discovery_page(base)
            except Exception:self.discovery_coverage['listingFailures']+=1
        links=kenyan_stock_links(home);listing_urls={}
        for node in soup(home).select('a[href]'):
            value=resolve_url(base,node['href'])
            if value:
                p=urlsplit(value)
                if p.scheme=='https' and p.netloc=='kenyanstocks.com' and p.path in ('/stock','/stocks'):listing_urls[value]=None
        for listing in listing_urls:
            if await self.io.downloader.robots_allowed(listing):
                try:links.extend(kenyan_stock_links(await self._discovery_page(listing)))
                except Exception:self.discovery_coverage['listingFailures']+=1
        documents=[]
        self.discovery_coverage['listedStocks']=len(set(links))
        for url in dict.fromkeys([*links,*[base+'/stock/nse/'+t for t in self.tickers]]):
            if await self.io.downloader.robots_allowed(url):documents.extend(stock_tab_documents(url))
        self.discovery_coverage.update(queuedStocks=len({d['context']['ticker'] for d in documents}),plannedViews=len(documents))
        return documents

    async def fetch(self,document):
        url=document['url'];context=document.get('context') or {}
        if not await self.io.downloader.robots_allowed(url):raise PermissionError('Publisher robots disallows document')
        if re.search(r'\.pdf$',urlsplit(url).path,re.I):
            artifact=await self.io.downloader.fetch(url)
            artifact=Artifact(artifact.path,artifact.url,'application/pdf',artifact.size,artifact.sha256)
            return await self.io.persist(document,artifact,'kenyanstocks',self.parser_version,metadata=dict(context,renderedWithBrowser=False,coverage=None))
        rendered=await self.renderer.render(url,stock_tab=context.get('tab') if isinstance(context.get('tab'),str) else None,
            category=context.get('category') if isinstance(context.get('category'),str) else None,
            history_start=context.get('historyStart') if isinstance(context.get('historyStart'),str) else None)
        page=soup(rendered['html'])
        if context.get('tab')=='Summary':
            tabs=[n.get_text().strip() for n in page.select('.normal-tab')]
            await self.jobs.enqueue(self.id,stock_tab_documents(url,tabs))
        if context.get('tab')=='Financials':
            categories=[n.get_text().strip() for n in page.select('button.tab-btn')]
            if categories:await self.jobs.enqueue(self.id,stock_tab_documents(url,['Financials'],categories))
        # PDFs may be embedded in any tab, not just the Files view. Preserve
        # issuer context so extracted statements can be matched to their stock.
        files=kenyan_file_links(rendered['html'],rendered['finalUrl'])
        for document_file in files:
            document_file['context']=dict(document_file.get('context') or {},ticker=context.get('ticker'))
        if files:await self.jobs.enqueue(self.id,files)
        coverage=rendered.get('coverage') or {}
        if coverage.get('scrollLimitReached') or coverage.get('expansionLimitReached'):
            raise ValueError('Publisher view coverage incomplete; durable job remains retryable')
        body=rendered['html'].encode('utf-8')
        file=tempfile.NamedTemporaryFile(prefix='continua-rendered-publisher-',suffix='.raw',delete=False)
        with file:file.write(body)
        artifact=Artifact(pathlib.Path(file.name),rendered['finalUrl'],'text/html; charset=utf-8',len(body),hashlib.sha256(body).hexdigest())
        return await self.io.persist(document,artifact,'kenyanstocks',self.parser_version,metadata=dict(context,renderedWithBrowser=True,coverage=rendered.get('coverage')))

    async def parse(self,fetched):
        if fetched.get('contentType')=='application/pdf':return dict(await self.pdf.extract(fetched['artifact'].path),entity={'companyName':None,'ticker':(fetched['document'].get('context') or {}).get('ticker'),'exchange':'NSE'})
        return parse_publisher_view(self.io.text(fetched['artifact']),fetched['document'].get('context') or {},fetched['document']['url'])
