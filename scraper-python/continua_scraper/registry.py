"""Native source adapter factories, permission gates and dynamic issuer fallback."""
from urllib.parse import urlsplit
from .policy import SourcePolicy
from .download import Downloader
from .adapter_io import AdapterIO
from .afx import AfxAdapter
from .rss import RssAdapter
from .nse import NseAdapter
from .kenyanstocks import KenyanStocksAdapter
from .browser import BrowserRenderer
from .crawler import GenericCrawler
from .mystocks import MyStocksAdapter,MyStocksHistoryAdapter
from .investment import WorldBankAdapter

REGISTERED={'nse','rss','kenyanstocks','afx','mystocks','worldbank'}

class AdapterRegistry:
    def __init__(self,sources,storage,evidence,jobs,checkpoints,runner,state,dead_letters,pdf,heavy_queue,database):
        self.sources,self.storage,self.evidence,self.jobs,self.checkpoints,self.runner=sources,storage,evidence,jobs,checkpoints,runner
        self.state,self.dead_letters,self.pdf,self.heavy_queue,self.database=state,dead_letters,pdf,heavy_queue,database

    async def build(self,source_id):
        light=getattr(self,'workload_role','full')=='render-light'
        if light and source_id!='nse-index-summary':raise ValueError('Bulk source is disabled on the light collector')
        source=await self.sources.get(source_id)
        if not source or not source['enabled']:raise ValueError('Source is missing or disabled')
        config=source.get('config') or {};adapter=source['adapter']
        if config.get('requiresCommercialPermission') is True or adapter=='mystocks':
            permission=config.get('permissionReference')
            if not isinstance(permission,str) or not 1<=len(permission.strip())<=200:
                raise PermissionError('Source requires its own recorded commercial permission reference')
        if light and adapter!='web':raise ValueError('Light collector requires the official HTML adapter')
        domains=list(config.get('allowedDomains') or [])
        if light:
            if any(domain not in ('nse.co.ke','www.nse.co.ke') for domain in domains):
                raise ValueError('Light source must remain on the official NSE origin')
            domains=['nse.co.ke','www.nse.co.ke']
        if adapter=='kenyanstocks':domains+=['kenyanstocks.com','assets.kenyanstocks.com']
        elif adapter=='nse':domains+=['nse.co.ke','www.nse.co.ke']
        elif adapter=='afx':domains+=['afx.kwayisi.org']
        elif adapter=='mystocks':domains+=['live.mystocks.co.ke']
        elif adapter=='rss' and config.get('feedUrl'):
            host=urlsplit(config['feedUrl']).hostname
            if host:domains+=[host]
        domains=tuple(dict.fromkeys(d.lower() for d in domains))
        # Private collection is distinct from public/full-document redistribution.
        # The publication worker independently enforces the recorded rights.
        policy=SourcePolicy(source_id,domains,source.get('redistributionAllowed') is True,
            user_agent='ContinuaBot/1.0 (+https://github.com/cypskip-create/Continua)',collection_allowed=True,allow_subdomains=True)
        downloader=Downloader(policy,requests_per_second=config.get('requestsPerSecond',.2),max_bytes=512*1024 if light else 50*1024*1024)
        downloader.light_workload=light
        io=AdapterIO(source,downloader,self.storage,self.evidence)
        if adapter=='rss':return RssAdapter(io)
        if adapter=='afx':return AfxAdapter(io)
        if adapter=='nse':return NseAdapter(io,self.jobs,self.checkpoints,self.pdf)
        if adapter=='mystocks':
            universe=await self.database.query("SELECT symbol FROM market.securities WHERE exchange='NSE' AND status<>'delisted' ORDER BY symbol")
            mode=config.get('collectionMode','quotes')
            if mode not in ('quotes','history'):raise ValueError('Unknown MyStocks collection mode')
            if mode=='history':return MyStocksHistoryAdapter(io,[row['symbol'] for row in universe])
            return MyStocksAdapter(io,[row['symbol'] for row in universe])
        if adapter=='worldbank':return WorldBankAdapter(io)
        if adapter=='kenyanstocks':
            universe=await self.database.query("SELECT symbol FROM market.securities WHERE exchange='NSE' AND status<>'delisted' ORDER BY symbol")
            renderer=BrowserRenderer(self.heavy_queue,downloader)
            return KenyanStocksAdapter(io,self.jobs,renderer,self.pdf,universe=[row['symbol'] for row in universe])
        from .extraction import ExtractionService
        return GenericCrawler(io,self.state,self.dead_letters,parser=ExtractionService(self.evidence,self.storage,self.pdf,self.dead_letters))

    async def run(self,source_id,*,drain_only=False,batch_size=None):
        adapter=await self.build(source_id)
        if isinstance(adapter,GenericCrawler):
            if drain_only:raise ValueError('Generic source uses crawl checkpoints, not document jobs')
            return await adapter.run(batch_size or 20)
        return await self.runner.run(adapter,drain_only=drain_only,batch_size=batch_size)
