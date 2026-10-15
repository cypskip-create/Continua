import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.tables import stock_tables


class CategoryScopeTests(unittest.TestCase):
    def test_inactive_category_is_not_relabelled_and_hidden_year_columns_remain(self):
        html='''<table data-continua-observed-visible="false"><tr><th>Item</th><th>2025</th></tr><tr><td>Revenue</td><td>100 B</td></tr></table>
        <table data-continua-observed-visible="true"><tr><th>Item</th><th>2025</th><th style="display:none">2024</th></tr><tr><td>Total assets</td><td>200 B</td><td style="display:none">180 B</td></tr></table>'''
        tables=stock_tables(html,'Financials','Assets')
        self.assertEqual(len(tables),1)
        self.assertEqual(tables[0]['category'],'Assets')
        self.assertEqual(tables[0]['columns'],['Item','2025','2024'])
        self.assertEqual(tables[0]['rows'][0]['cells'][1]['raw'],'180 B')
