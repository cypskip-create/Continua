import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.browser_proxy import BrowserProxy
from continua_scraper.policy import SourcePolicy

class BrowserBudgetTests(unittest.TestCase):
    def test_all_tunnels_and_directions_share_page_budget(self):
        proxy=BrowserProxy(SourcePolicy('fixture',('fixture.example',),True),max_bytes=10)
        proxy.account_transfer(4) # first tunnel upload
        proxy.account_transfer(3) # first tunnel download
        proxy.account_transfer(3) # second tunnel, same page budget
        self.assertEqual(proxy.transferred_bytes,10)
        with self.assertRaises(ValueError):proxy.account_transfer(1)
        self.assertGreater(proxy.transferred_bytes,proxy.max_bytes)
    def test_invalid_or_unbounded_budget_is_rejected(self):
        policy=SourcePolicy('fixture',('fixture.example',),True)
        for limit in (0,-1,True,50*1024*1024+1):
            with self.assertRaises(ValueError):BrowserProxy(policy,max_bytes=limit)
        proxy=BrowserProxy(policy)
        for size in (-1,True,1.5):
            with self.assertRaises(ValueError):proxy.account_transfer(size)
