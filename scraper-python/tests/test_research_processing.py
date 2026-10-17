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
from continua_scraper.research_processing import reparse_archived_views
from continua_scraper import transfer_budget
from types import SimpleNamespace
from unittest.mock import AsyncMock
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
    async def test_company_assembly_is_persisted_automatically_with_current_rights_gates(self):
        class AssemblyDB:
            def __init__(self):self.calls=[]
            async def query(self,sql,params=()):
                self.calls.append((sql,params))
                if sql.startswith('SELECT DISTINCT'):
                    return [{'extraction_id':7,'security_id':'NSE:CGEN','extracted_at':datetime.now(timezone.utc),
                      'payload':{'destination':'financials','category':'Profit/Loss','status':'publisher_observation',
                        'financialFields':[{'metric':'revenue','year':2024,'value':100},{'metric':'netIncome','year':2024,'value':20}]}}]
                return []
        db=AssemblyDB()
        self.assertEqual(await ResearchProcessor(db).refresh_company_contexts(),1)
        self.assertIn('s.redistribution_allowed=true',db.calls[0][0])
        self.assertIn("'{companyResearch}'",db.calls[1][0])
        self.assertEqual(json.loads(db.calls[1][1][0])['latest']['ratios']['netMargin'],.2)

    async def test_archive_upgrade_requires_reserved_budget_and_uses_existing_extraction_checks(self):
        runtime=SimpleNamespace(database=SimpleNamespace(query=AsyncMock(return_value=[{'id':9}])),
            extraction=SimpleNamespace(reprocess=AsyncMock()))
        previous=transfer_budget.active
        try:
            transfer_budget.active=None
            with self.assertRaises(ValueError):await reparse_archived_views(runtime)
            transfer_budget.active=transfer_budget.TransferBudget(1024)
            self.assertEqual((await reparse_archived_views(runtime))['reprocessed'],1)
            runtime.extraction.reprocess.assert_awaited_once_with(9)
            self.assertIn("a.metadata->>'ticker'=e.entity->>'ticker'",runtime.database.query.call_args[0][0])
        finally:transfer_budget.active=previous

    async def test_versioned_transaction_claims_and_receipts_are_bounded(self):
        db=DB([row()]);summary=await ResearchProcessor(db).run(1)
        self.assertEqual(summary['processed'],1)
        self.assertIn('FOR UPDATE OF e SKIP LOCKED LIMIT 1',db.calls[0][0])
        self.assertIn('DESC NULLS LAST',db.calls[0][0])
        self.assertIn('p.gate_signature IS DISTINCT FROM',db.calls[0][0])
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
