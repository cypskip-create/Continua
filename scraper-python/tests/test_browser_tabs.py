import unittest
from types import SimpleNamespace
from continua_scraper.browser_tabs import select_stock_tab

class Tabs(unittest.TestCase):
    def run_tab(self,selected,available=True,changes=True):
        calls=[]
        class Node:
            text='Financials'
            def is_displayed(self):return True
            def click(self):
                nonlocal selected
                calls.append('click')
                if changes:selected='Financials'
        class Driver:
            def find_elements(self,by,selector):return [SimpleNamespace(text=selected)] if 'selected-tab' in selector else [Node()] if available else []
            def execute_script(self,*args):calls.append('scroll')
        driver=Driver()
        class Wait:
            def until(self,fn):
                result=fn(driver)
                if not result:raise TimeoutError('not selected')
                return result
        select_stock_tab(driver,SimpleNamespace(CSS_SELECTOR='css'),'Financials',Wait(),lambda:calls.append('settle'))
        return calls
    def test_url_selected_view_needs_no_click(self):self.assertEqual(self.run_tab('Financials'),[])
    def test_ignored_url_selects_visible_tab_then_verifies(self):self.assertEqual(self.run_tab('Summary'),['scroll','click','settle'])
    def test_missing_or_wrong_view_never_becomes_financials(self):
        with self.assertRaises(TimeoutError):self.run_tab('Summary',available=False)
        with self.assertRaises(TimeoutError):self.run_tab('Summary',changes=False)
