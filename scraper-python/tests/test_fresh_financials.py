import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.kenyanstocks import KenyanStocksAdapter
from continua_scraper.documents import DocumentJobs

class FreshFinancialTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_registered_issuer_and_all_financial_categories(self):
        adapter=KenyanStocksAdapter(SimpleNamespace(source={'id':'kenyanstocks','config':{}}),None,None,None,universe=['COOP'])
        docs=await adapter.discover_issuer_financials('COOP')
        self.assertEqual(len(docs),5)
        self.assertEqual({d['context']['ticker'] for d in docs},{'COOP'})
        self.assertEqual({d['context']['tab'] for d in docs},{'Financials'})
        with self.assertRaises(ValueError):await adapter.discover_issuer_financials('UNKNOWN')

    async def test_refresh_retains_evidence_and_active_leases_and_claims_exact_issuer(self):
        db=SimpleNamespace(query=AsyncMock(return_value=[]))
        jobs=DocumentJobs(db,max_attempts=5)
        await jobs.refresh_documents('kenyanstocks',[{'url':'https://kenyanstocks.com/stock/nse/COOP?tab=Financials'}])
        sql,args=db.query.call_args.args
        self.assertIn("status<>'processing' OR lease_until<now()",sql)
        self.assertNotIn('DELETE',sql)
        self.assertEqual(args[0],'kenyanstocks')
        await jobs.claim('kenyanstocks',1,lane='Financials',issuer='COOP')
        sql,args=db.query.call_args.args
        self.assertIn("document->'context'->>'ticker'=%s",sql)
        self.assertIn("document->'context'->>'tab'='Financials'",sql)
        self.assertEqual(args,('kenyanstocks','COOP',5,'Financials',1))
        with self.assertRaises(ValueError):await jobs.claim('kenyanstocks',1,issuer="COOP' OR true")
