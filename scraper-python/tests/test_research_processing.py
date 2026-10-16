import pathlib
import sys
import unittest
import json
from contextlib import asynccontextmanager
from datetime import datetime,timezone
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scraper-python'))
sys.path.insert(0,str(ROOT/'engine-python'))
from continua_scraper.research_processing import ResearchProcessor
from continua_scraper.kenyanstocks import parse_publisher_view


class DB:
    def __init__(self,rows):self.rows=list(rows);self.calls=[]
    @asynccontextmanager
    async def transaction(self):yield self
    async def query(self,sql,params=()):
        self.calls.append((sql,params))
        if sql.lstrip().startswith('SELECT e.id'):
            return [self.rows.pop(0)] if self.rows else []
        return []


def row(**changes):
    return dict({'id':1,'method':'html','text':'','tables':[],'entity':{'ticker':'COOP'},'needs_review':True,
        'document_url':'https://kenyanstocks.com/stock/nse/COOP?tab=Summary','content_type':'text/html',
        'metadata':{'tab':'Summary'},'title':'COOP','source_id':'kenyanstocks','sha256':'a'*64,
        'storage_path':'r2://continua-financial-documents/evidence','retrieved_at':datetime.now(timezone.utc),
        'enabled':True,'redistribution_allowed':True,'config':{'permissionReference':'approved'},'security_id':'NSE:COOP'},**changes)


class ProcessingTests(unittest.IsolatedAsyncioTestCase):
    async def test_versioned_transaction_claims_and_receipts_are_bounded(self):
        db=DB([row()]);summary=await ResearchProcessor(db).run(1)
        self.assertEqual(summary['processed'],1)
        self.assertIn('FOR UPDATE OF e SKIP LOCKED LIMIT 1',db.calls[0][0])
        self.assertIn('DESC NULLS LAST',db.calls[0][0])
        self.assertIn('ON CONFLICT',db.calls[1][0])
        payload=json.loads(db.calls[1][1][-1])
        self.assertEqual(payload['destination'],'overview')
        self.assertNotIn('storage_path',payload)

    async def test_revoked_permission_unknown_issuer_and_non_r2_evidence_block_publication(self):
        for invalid in (row(enabled=False),row(redistribution_allowed=False),row(config={}),row(security_id=None),row(storage_path='/tmp/report.pdf')):
            db=DB([invalid]);summary=await ResearchProcessor(db).run(1)
            self.assertEqual(summary['blocked'],1)

    async def test_database_failure_remains_retryable_and_not_acknowledged(self):
        class Broken(DB):
            async def query(self,sql,params=()):
                if sql.lstrip().startswith('INSERT'):raise RuntimeError('offline')
                return await super().query(sql,params)
        with self.assertRaises(RuntimeError):await ResearchProcessor(Broken([row()])).run(1)

    async def test_visible_non_table_tabs_files_facts_and_cards_are_extracted(self):
        html='''<body><main><h2>Corporate Actions</h2><article>Dividend announcement</article>
        <dl><dt>Market cap</dt><dd>KES 10 B</dd></dl>
        <div class="file-content"><h3>Annual Report</h3><link itemprop="url" href="https://assets.kenyanstocks.com/a.pdf"></div>
        <script>secret script</script></main></body>'''
        parsed=parse_publisher_view(html,{'ticker':'COOP','tab':'Corporate Actions'},'https://kenyanstocks.com/stock/nse/COOP')
        view=next(t for t in parsed['tables'] if t.get('kind')=='publisher_view')
        self.assertEqual(view['files'][0]['title'],'Annual Report')
        self.assertEqual(view['facts'][0]['label'],'Market cap')
        self.assertEqual(view['blocks'],['Dividend announcement'])
        self.assertNotIn('secret script',parsed.get('text') or '')

    async def test_live_statistics_card_layout_retains_year_and_number(self):
        parsed=parse_publisher_view('<body><div class="stat-card"><label>Revenue (2024)</label><div class="value">KES 117.24 B</div></div></body>',
            {'ticker':'COOP','tab':'Statistics'},'https://kenyanstocks.com/stock/nse/COOP?tab=Statistics')
        view=next(t for t in parsed['tables'] if t.get('kind')=='publisher_view')
        self.assertEqual(view['facts'],[{'label':'Revenue (2024)','raw':'KES 117.24 B'}])


if __name__=='__main__':unittest.main()
