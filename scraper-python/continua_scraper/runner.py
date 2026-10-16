"""Native adapter execution: durable leases, immutable extraction and retry.

Adapters own discovery/fetch/parse; no Node process or compatibility forwarding.
File-backed fetch results are disposed in finally, including skipped reprocessing.
"""
import asyncio
import re

def _pdf(fetched,document):
    return 'application/pdf' in (fetched.get('contentType') or '') or bool(re.search(r'\.pdf(?:[?#]|$)',document['url'],re.I))

def extraction_version(adapter,is_pdf):
    version=getattr(adapter,'parser_version',None)
    parser=getattr(adapter,'pdf',None) if is_pdf else None
    if parser is not None and getattr(parser,'parser_version',None):
        return f"{version or adapter.id}|{parser.parser_version}|ocr-native-v1:{int(bool(getattr(parser,'ocr',False)))}"
    return version

async def _dispose(fetched):
    if fetched is None:return
    cleanup=fetched.get('cleanup')
    if cleanup is not None:
        value=cleanup()
        if hasattr(value,'__await__'):await value

class AdapterRunner:
    def __init__(self,jobs,evidence,dead_letters):
        self.jobs,self.evidence,self.dead_letters=jobs,evidence,dead_letters

    async def run(self,adapter,*,drain_only=False,batch_size=None,issuer=None,fresh=False):
        durable=getattr(adapter,'persistent_batch_size',None) is not None
        if drain_only and not durable:raise ValueError('Adapter has no durable document queue')
        batch=adapter.persistent_batch_size if batch_size is None and durable else batch_size
        if durable and (type(batch) is not int or not 1<=batch<=100):raise ValueError('Invalid adapter batch')
        if drain_only:
            try:await self.jobs.requeue_incomplete(adapter.id,batch)
            except Exception:pass # Existing queued work remains usable during recovery outage.
        if fresh and not issuer:raise ValueError('Fresh collection requires an exact issuer')
        if issuer and (drain_only or not durable or not hasattr(adapter,'discover_issuer_financials')):
            raise ValueError('Targeted financial collection is unavailable for this adapter')
        documents=await adapter.discover_issuer_financials(issuer) if issuer else [] if drain_only else await adapter.discover()
        if not isinstance(documents,list):raise ValueError('Invalid adapter discovery result')
        summary={'adapterId':adapter.id,'discovered':len(documents),'fetched':0,'newArtifacts':0,'extracted':0,'needsReview':0,'failed':0,'skipped':0}
        coverage=getattr(adapter,'discovery_coverage',None)
        if coverage is not None:
            summary['discoveryCoverage']=coverage
            if coverage.get('listingFailures'):summary['failed']+=coverage['listingFailures']
        if durable:await self.jobs.enqueue(adapter.id,documents)
        if fresh:await self.jobs.refresh_documents(adapter.id,documents)
        if issuer:batch=min(batch,len(documents))
        remaining=batch if durable else len(documents)
        cursor=0
        concurrency=getattr(adapter,'document_concurrency',1)
        # Heavy document adapters remain serial; lightweight articles get at most
        # two simultaneous workers on the 512MB candidate service.
        concurrency=max(1,min(int(concurrency),2))
        async def worker():
            nonlocal remaining,cursor
            while remaining>0:
                from .transfer_budget import active
                if active is not None and active.exhausted:return
                remaining-=1
                job=None
                if durable:
                    lanes=getattr(adapter,'claim_lanes',())
                    options={'issuer':issuer} if issuer else {}
                    if lanes:options['lane']=lanes[(batch-remaining-1)%len(lanes)]
                    claims=await self.jobs.claim(adapter.id,1,**options)
                    if not claims:return
                    job=claims[0];document=job['document']
                else:
                    document=documents[cursor];cursor+=1
                fetched=None;stage='fetch'
                try:
                    fetched=await adapter.fetch(document)
                    stage='parse';summary['fetched']+=1
                    if fetched['isNewArtifact']:summary['newArtifacts']+=1
                    pdf=_pdf(fetched,document)
                    previous=None
                    if not fetched['isNewArtifact']:
                        if getattr(adapter,'scope_extractions_by_ticker',False):
                            previous=await self.evidence.latest_extraction_for_ticker(fetched['artifactId'],(document.get('context') or {}).get('ticker'))
                        else:previous=await self.evidence.latest_extraction(fetched['artifactId'])
                    version=extraction_version(adapter,pdf)
                    reusable=previous and (not version or previous.get('parserVersion')==version) and (not pdf or len((previous.get('text') or '').strip())>=50)
                    if reusable or getattr(adapter,'parse',None) is None:
                        summary['skipped']+=1
                        if job:await self.jobs.finish(job['id'],job['attempts'])
                        continue
                    parsed=await adapter.parse(fetched)
                    if pdf and len((parsed.get('text') or '').strip())<50:
                        raise ValueError('PDF extraction produced no usable text; document remains retryable')
                    await self.evidence.insert_extraction({'artifactId':fetched['artifactId'],'method':parsed['method'],
                        'confidence':parsed.get('confidence'),'parserVersion':version or parsed.get('parserVersion') or 'adapter-runner-0.2.0',
                        'text':parsed.get('text'),'tables':parsed.get('tables'),'entity':parsed.get('entity'),'needsReview':parsed['needsReview']})
                    summary['extracted']+=1
                    if parsed['needsReview']:summary['needsReview']+=1
                    if job:await self.jobs.finish(job['id'],job['attempts'])
                except Exception as error:
                    summary['failed']+=1
                    errors=summary.setdefault('errorClasses',{})
                    category=f'{stage}:{type(error).__name__}'
                    safe_code=getattr(error,'safe_code',None)
                    if safe_code in {*(f'browser_exit_{i}' for i in range(1,20)),'browser_exit_other'}:
                        category=f'{stage}:{safe_code}'
                    errors[category]=errors.get(category,0)+1
                    # Classification is safe even when SDK exceptions include
                    # server credentials; detailed private provider errors are
                    # not copied into database/public operator responses.
                    reason=f'{stage}: {type(error).__name__}'
                    if isinstance(error,ValueError) and str(error)=='PDF extraction produced no usable text; document remains retryable':reason=str(error)
                    try:await self.dead_letters.record(adapter.id,document['url'],stage,reason)
                    except Exception:pass
                    if job:await self.jobs.finish(job['id'],job['attempts'],reason)
                finally:
                    await _dispose(fetched)
        async with asyncio.TaskGroup() as group:
            for _ in range(min(concurrency,remaining)):group.create_task(worker())
        if issuer:
            complete=summary['failed']==0 and summary['fetched']==len(documents)
            summary['targetCoverage']={'issuer':issuer,'tab':'Financials','plannedViews':len(documents),'complete':complete}
            if not complete and summary['failed']==0:summary['failed']=1
        return summary
