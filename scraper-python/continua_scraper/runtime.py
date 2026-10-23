"""Complete collector wiring; constructing the candidate starts no jobs."""
from .sources import Sources
from .documents import DocumentJobs
from .artifacts import EvidenceRepository
from .dead_letters import DeadLetters
from .crawl_state import CrawlState
from .archive_checkpoints import ArchiveCheckpoints
from .runner import AdapterRunner
from .serial import SerialWorkQueue
from .pdf import PdfExtractor
from .registry import AdapterRegistry
from .extraction import ExtractionService
from .archive import R2Archive
from .scheduler import CollectorScheduler
from .market_source import MarketSource
import os

class CollectorRuntime:
    def __init__(self,database,storage,*,scheduler_enabled=False):
        self.database,self.storage=database,storage
        self.workload_role=os.environ.get('SCRAPER_WORKLOAD_ROLE','full')
        if self.workload_role not in ('full','render-light'):raise ValueError('Invalid collector workload role')
        self.sources,self.jobs,self.evidence=Sources(database),DocumentJobs(database),EvidenceRepository(database)
        self.dead_letters,self.state,self.checkpoints=DeadLetters(database),CrawlState(database),ArchiveCheckpoints(database)
        self.runner=AdapterRunner(self.jobs,self.evidence,self.dead_letters)
        self.heavy_queue=SerialWorkQueue(25);self.pdf=PdfExtractor(self.heavy_queue,native=os.environ.get('PDF_NATIVE_ENGINE','poppler'))
        self.registry=AdapterRegistry(self.sources,storage,self.evidence,self.jobs,self.checkpoints,self.runner,self.state,self.dead_letters,self.pdf,self.heavy_queue,database)
        self.registry.workload_role=self.workload_role
        self.extraction=ExtractionService(self.evidence,storage,self.pdf,self.dead_letters)
        self.archive=R2Archive(database,storage.r2,storage.materialize,include_legacy=storage.rollback is not None)
        self.market_source=MarketSource(self)
        def batch(name,default):
            value=int(os.environ.get(name,str(default)))
            if not 1<=value<=100:raise ValueError('Invalid collector batch configuration')
            return value
        from .render_light import RenderLightScheduler
        scheduler_type=RenderLightScheduler if self.workload_role=='render-light' else CollectorScheduler
        self.scheduler=scheduler_type(self.sources,self.registry,self.extraction,self.archive,enabled=scheduler_enabled,
            news_cron=os.environ.get('NEWS_CRAWL_CRON','*/10 * * * *'),default_cron=os.environ.get('DEFAULT_CRAWL_CRON','0 */6 * * *'),
            drain_cron=os.environ.get('DOCUMENT_DRAIN_CRON','*/2 * * * *'),drain_batch=batch('DOCUMENT_DRAIN_BATCH_SIZE',10),
            sweep_cron=os.environ.get('EXTRACTION_SWEEP_CRON','*/15 * * * *'),sweep_batch=batch('EXTRACTION_SWEEP_BATCH_SIZE',50),
            archive_cron=os.environ.get('R2_ARCHIVE_CRON','*/15 * * * *'),archive_batch=batch('R2_ARCHIVE_BATCH_SIZE',5))

    async def close(self):
        await self.scheduler.close();await self.extraction.close();await self.archive.close();await self.heavy_queue.close()
        self.storage.close();await self.database.close()
