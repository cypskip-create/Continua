import asyncio
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.runner import AdapterRunner
from types import SimpleNamespace

class Jobs:
    def __init__(self):self.pending=[];self.finished=[];self.claims=[]
    async def enqueue(self,source,docs):self.pending.extend({'id':i+1,'attempts':2,'document':d} for i,d in enumerate(docs))
    async def claim(self,source,limit):self.claims.append(limit);return [self.pending.pop(0)] if self.pending else []
    async def finish(self,id,attempt,error=None):self.finished.append((id,attempt,error))
    async def requeue_incomplete(self,source,batch):pass
class Evidence:
    def __init__(self):self.rows=[];self.previous=None
    async def latest_extraction(self,id):return self.previous
    async def insert_extraction(self,row):self.rows.append(row)
class Dead:
    def __init__(self,fail=False):self.rows=[];self.fail=fail
    async def record(self,*args):
        if self.fail:raise RuntimeError('audit unavailable')
        self.rows.append(args)
class Adapter:
    id='fixture';persistent_batch_size=4;document_concurrency=2;parser_version='native-1'
    def __init__(self):self.disposed=[];self.text='source evidence '*10;self.new=True;self.active=0;self.peak=0
    async def discover(self):return [{'url':f'https://fixture.example/{i}.pdf'} for i in range(4)]
    async def fetch(self,doc):
        self.active+=1;self.peak=max(self.peak,self.active);await asyncio.sleep(0)
        def cleanup():self.active-=1;self.disposed.append(doc['url'])
        return {'artifactId':1,'isNewArtifact':self.new,'contentType':'application/pdf','cleanup':cleanup}
    async def parse(self,fetched):return {'method':'native_pdf_text','text':self.text,'confidence':.8,'tables':[],'entity':{},'needsReview':True}

class RunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_fresh_issuer_batch_does_not_discover_or_claim_other_stocks(self):
        class TargetJobs(Jobs):
            async def refresh_documents(self,source,docs):self.refreshed=docs
            async def claim(self,source,limit,*,issuer):
                self.asserted_issuer=issuer
                return await super().claim(source,limit)
        class TargetAdapter(Adapter):
            async def discover(self):raise AssertionError('Broad discovery must not run')
            async def discover_issuer_financials(self,ticker):
                return [{'url':'https://fixture.example/financials.pdf','context':{'ticker':ticker,'tab':'Financials'}}]
        jobs,evidence=TargetJobs(),Evidence()
        result=await AdapterRunner(jobs,evidence,Dead()).run(TargetAdapter(),issuer='COOP',fresh=True)
        self.assertEqual(result['extracted'],1)
        self.assertEqual(result['targetCoverage'],{'issuer':'COOP','tab':'Financials','plannedViews':1,'complete':True})
        self.assertEqual(jobs.asserted_issuer,'COOP')
        self.assertEqual(len(jobs.refreshed),1)
        with self.assertRaises(ValueError):await AdapterRunner(jobs,evidence,Dead()).run(TargetAdapter(),fresh=True)

    async def test_target_with_unavailable_claims_is_not_reported_complete(self):
        class LeasedJobs(Jobs):
            async def claim(self,source,limit,**options):return []
        class TargetAdapter(Adapter):
            async def discover_issuer_financials(self,ticker):return [{'url':'https://fixture.example/a.pdf'}]
        result=await AdapterRunner(LeasedJobs(),Evidence(),Dead()).run(TargetAdapter(),issuer='COOP')
        self.assertFalse(result['targetCoverage']['complete'])
        self.assertEqual(result['failed'],1)

    async def test_identical_bytes_keep_separate_issuer_extractions(self):
        class ScopedEvidence(Evidence):
            async def latest_extraction(self, id):
                raise AssertionError('Unscoped lookup must not be used')
            async def latest_extraction_for_ticker(self, id, ticker):
                return next((row for row in self.rows if row['entity']['ticker']==ticker), None)
        class ScopedAdapter(Adapter):
            scope_extractions_by_ticker=True
            async def discover(self):
                return [{'url':f'https://fixture.example/{ticker}', 'context':{'ticker':ticker}} for ticker in ('KCB','ABSA')]
            async def fetch(self, doc):
                return {'artifactId':1, 'isNewArtifact':False, 'contentType':'application/json', 'ticker':doc['context']['ticker']}
            async def parse(self, fetched):
                return {'method':'json','text':'evidence','tables':[], 'entity':{'ticker':fetched['ticker']},'needsReview':True}
        evidence=ScopedEvidence();adapter=ScopedAdapter()
        first=await AdapterRunner(Jobs(),evidence,Dead()).run(adapter)
        second=await AdapterRunner(Jobs(),evidence,Dead()).run(adapter)
        self.assertEqual(first['extracted'],2)
        self.assertEqual(second['extracted'],0)
        self.assertEqual({row['entity']['ticker'] for row in evidence.rows},{'KCB','ABSA'})

    async def test_pdf_cache_identity_covers_adapter_native_and_ocr_versions(self):
        jobs,evidence=Jobs(),Evidence();adapter=Adapter();adapter.pdf=SimpleNamespace(parser_version='poppler-1',ocr=True)
        result=await AdapterRunner(jobs,evidence,Dead()).run(adapter)
        version=evidence.rows[0]['parserVersion']
        self.assertEqual(version,'native-1|poppler-1|ocr-native-v1:1')
        adapter.new=False;evidence.previous={'text':'x'*50,'parserVersion':version};evidence.rows=[]
        result=await AdapterRunner(Jobs(),evidence,Dead()).run(adapter)
        self.assertEqual(result['extracted'],0)
        adapter.pdf.parser_version='poppler-2'
        result=await AdapterRunner(Jobs(),evidence,Dead()).run(adapter)
        self.assertEqual(result['extracted'],4)

    async def test_durable_claims_one_per_worker_preserve_versions_and_cleanup(self):
        jobs,evidence,dead=Jobs(),Evidence(),Dead();adapter=Adapter()
        result=await AdapterRunner(jobs,evidence,dead).run(adapter)
        self.assertEqual(result['extracted'],4);self.assertEqual(result['needsReview'],4)
        self.assertEqual(jobs.claims,[1]*4);self.assertTrue(all(row[1]==2 for row in jobs.finished))
        self.assertEqual(len(adapter.disposed),4);self.assertLessEqual(adapter.peak,2)
        self.assertTrue(all(row['parserVersion']=='native-1' for row in evidence.rows))

    async def test_empty_pdf_failure_stays_retryable_even_when_audit_fails(self):
        jobs,evidence=Jobs(),Evidence();adapter=Adapter();adapter.text='empty'
        result=await AdapterRunner(jobs,evidence,Dead(True)).run(adapter)
        self.assertEqual(result['failed'],4);self.assertEqual(evidence.rows,[])
        self.assertTrue(all(row[2] for row in jobs.finished));self.assertEqual(len(adapter.disposed),4)

    async def test_matching_previous_skips_but_empty_or_stale_version_reparses(self):
        for previous,expected in [({'text':'x'*50,'parserVersion':'native-1'},0),({'text':'','parserVersion':'native-1'},4),({'text':'x'*50,'parserVersion':'old'},4)]:
            jobs,evidence=Jobs(),Evidence();evidence.previous=previous;adapter=Adapter();adapter.new=False
            result=await AdapterRunner(jobs,evidence,Dead()).run(adapter)
            self.assertEqual(result['extracted'],expected);self.assertEqual(len(adapter.disposed),4)

    async def test_cancelled_parse_cleans_file_and_leaves_lease_for_recovery(self):
        jobs,evidence=Jobs(),Evidence();adapter=Adapter();entered=asyncio.Event()
        async def parse(fetched):entered.set();await asyncio.Event().wait()
        adapter.parse=parse
        task=asyncio.create_task(AdapterRunner(jobs,evidence,Dead()).run(adapter))
        await entered.wait();task.cancel()
        with self.assertRaises(asyncio.CancelledError):await task
        self.assertTrue(adapter.disposed);self.assertEqual(jobs.finished,[])

if __name__=='__main__':unittest.main()
