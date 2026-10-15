"""One extraction path for immutable reprocessing and autonomous sweep recovery."""
import asyncio
import re
from contextlib import asynccontextmanager
from .adapter_io import AdapterIO
from .html import article_body_text,nse_index_summary
from .tables import html_financial_tables

@asynccontextmanager
async def materialized(storage,location,source_url=None):
    reader=storage.materialize(location,source_url=source_url)
    task=asyncio.create_task(asyncio.to_thread(reader.__enter__))
    try:artifact=await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
            await asyncio.to_thread(reader.__exit__,None,None,None)
        finally:raise
    try:yield artifact
    finally:await asyncio.to_thread(reader.__exit__,None,None,None)

class ExtractionService:
    def __init__(self,evidence,storage,pdf,dead_letters):
        self.evidence,self.storage,self.pdf,self.dead_letters=evidence,storage,pdf,dead_letters
        self._sweep=None

    async def by_content_type(self,content_type,artifact):
        type=content_type or ''
        if 'application/pdf' in type:return await self.pdf.extract(artifact.path)
        if 'text/html' in type:
            html=AdapterIO.text(artifact);tables=html_financial_tables(html);indices=nse_index_summary(html);text=article_body_text(html);usable=len(text)>=100
            return {'method':'html','confidence':.6 if usable else .1,'text':text if usable else None,'tables':tables+indices,
                'needsReview':bool(tables) or (not usable and not indices)}
        return None

    @staticmethod
    def verify_source(record,artifact):
        expected=record.get('sha256');size=record.get('sizeBytes')
        if not isinstance(expected,str) or not re.fullmatch(r'[a-f0-9]{64}',expected) or expected!=artifact.sha256:
            raise ValueError('Decoded source checksum differs from immutable evidence')
        if type(size) is not int or size!=artifact.size:raise ValueError('Decoded source size differs from immutable evidence')

    async def reprocess(self,artifact_id):
        artifact=await self.evidence.artifact_by_id(artifact_id)
        if artifact is None:raise ValueError('No raw artifact found')
        async with materialized(self.storage,artifact['storagePath'],artifact.get('documentUrl')) as raw:
            self.verify_source(artifact,raw)
            result=await self.by_content_type(artifact.get('contentType'),raw)
        if result is None:raise ValueError('Reprocessing not supported for content type')
        return await self.evidence.insert_extraction(dict(result,artifactId=artifact_id,parserVersion=result.get('parserVersion') or 'reprocess-0.2.0',entity={}))

    async def sweep(self,limit=50):
        if self._sweep is not None and not self._sweep.done():return await asyncio.shield(self._sweep)
        if type(limit) is not int or not 1<=limit<=100:raise ValueError('Extraction batch size must be 1–100')
        self._sweep=asyncio.create_task(self._run_sweep(limit))
        return await asyncio.shield(self._sweep)

    async def _run_sweep(self,limit):
        pending=await self.evidence.unextracted(limit)
        summary={'examined':0,'extracted':0,'needsReview':0,'skippedUnsupported':0,'failed':0}
        for artifact in pending:
            summary['examined']+=1
            try:
                async with materialized(self.storage,artifact['storagePath'],artifact.get('documentUrl')) as raw:
                    self.verify_source(artifact,raw)
                    result=await self.by_content_type(artifact.get('contentType'),raw)
                if result is None:summary['skippedUnsupported']+=1;continue
                if 'pdf' in (artifact.get('contentType') or '') and len((result.get('text') or '').strip())<50:raise ValueError('PDF has no usable text; sweep will retry')
                await self.evidence.insert_extraction(dict(result,artifactId=artifact['artifactId'],parserVersion=result.get('parserVersion') or 'extraction-sweep-0.2.0',entity={}))
                summary['extracted']+=1
                if result['needsReview']:summary['needsReview']+=1
            except Exception as error:
                summary['failed']+=1
                try:await self.dead_letters.record(artifact['sourceId'],artifact['documentUrl'],'parse',f'parse: {type(error).__name__}')
                except Exception:pass
        return summary

    async def close(self):
        if self._sweep is not None:await asyncio.shield(self._sweep)
