"""AFX profiles and close candidates stay source-attributed and unreviewed."""
import re
from urllib.parse import urlsplit
from .html import soup,resolve_url,afx_profile_facts,afx_close_candidates
from .afx_quote import quote_candidate

class AfxAdapter:
    document_concurrency=1
    persistent_batch_size=10
    parser_version='afx-observed-profile-quote-v2'
    def __init__(self,io):self.io=io;self.id=io.source['id']

    async def discover(self):
        url='https://afx.kwayisi.org/nse/'
        if not await self.io.downloader.robots_allowed(url):return []
        artifact=await self.io.downloader.fetch(url)
        try:
            await self.io.persist({'url':url,'context':{'discoveryIndex':True}},artifact,'afx',self.parser_version)
            documents={}
            for node in soup(self.io.text(artifact)).select('a[href]'):
                value=resolve_url(url,node['href'])
                if not value:continue
                parsed=urlsplit(value);match=re.fullmatch(r'/nse/([a-z0-9-]+)\.html',parsed.path)
                if parsed.scheme=='https' and parsed.netloc=='afx.kwayisi.org' and match:documents[value]={'url':value,'discoveredFrom':url,'context':{'ticker':match[1].upper()}}
            return list(documents.values())
        finally:artifact.path.unlink(missing_ok=True)

    async def fetch(self,document):return await self.io.fetch_document(document,'afx',self.parser_version)

    async def parse(self,fetched):
        html=self.io.text(fetched['artifact']);doc=soup(html);profile=afx_profile_facts(html,document=doc)
        for node in doc.select('script,style,nav,footer,#comments'):node.decompose()
        ticker=(fetched['document'].get('context') or {}).get('ticker')
        quote=quote_candidate(html,ticker,document=doc)
        return {'method':'html','confidence':.8 if profile else .3,'text':doc.body.get_text().strip() if doc.body else '',
            'tables':([profile] if profile else [])+([quote] if quote else [])+afx_close_candidates(html,document=doc),
            'entity':{'companyName':profile['companyName'] if profile else None,'ticker':ticker if isinstance(ticker,str) else None,'exchange':'NSE'},'needsReview':True}
