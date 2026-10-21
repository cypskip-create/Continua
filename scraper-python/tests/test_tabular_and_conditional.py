import asyncio
import pathlib
import sys
import tempfile
import unittest
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import urlsplit
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.tabular import parse_tabular
from continua_scraper.download import Downloader,SourceNotModified,SourceHTTPError,cache_validator
from continua_scraper.runner import AdapterRunner

class TabularTests(unittest.TestCase):
 def test_csv_preserves_parentheses_and_missing_cells(self):
  with tempfile.TemporaryDirectory() as directory:
   path=pathlib.Path(directory)/'report.csv';path.write_text('Metric,2024,2023\nProfit,"(1,200)",\n',encoding='utf-8')
   parsed=parse_tabular(path,'text/csv')
   self.assertEqual(parsed['tables'][0]['rows'][0]['values'],['(1,200)',''])
   self.assertTrue(parsed['needsReview'])
 def test_xlsx_preserves_source_rows_and_never_evaluates_formulas(self):
  with tempfile.TemporaryDirectory() as directory:
   path=pathlib.Path(directory)/'report.xlsx'
   with zipfile.ZipFile(path,'w') as package:
    package.writestr('xl/worksheets/sheet1.xml','''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Metric</t></is></c><c r="B1"><v>2024</v></c></row><row r="10"><c r="A10" t="inlineStr"><is><t>Revenue</t></is></c><c r="B10"><f>WEBSERVICE("https://never-fetched.invalid")</f><v>999</v></c></row></sheetData></worksheet>''')
   row=parse_tabular(path,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')['tables'][0]['rows'][0]
   self.assertEqual(row['values'],[None]);self.assertEqual(row['sourceRow'],10)

class ConditionalTests(unittest.IsolatedAsyncioTestCase):
 async def test_304_requires_an_explicit_validator_and_closes_transport(self):
  policy=SimpleNamespace(check_url=urlsplit)
  downloader=Downloader(policy)
  writer=SimpleNamespace(close=lambda:None,wait_closed=AsyncMock())
  downloader._robots_allowed=AsyncMock(return_value=True)
  downloader._connection=AsyncMock(return_value=(304,{},None,writer))
  with self.assertRaises(SourceNotModified):await downloader.fetch('https://fixture.example/file',request_headers={'If-None-Match':'"known"'})
  writer.wait_closed.assert_awaited_once()
  with self.assertRaises(SourceHTTPError) as error:await downloader.fetch('https://fixture.example/file')
  self.assertNotIsInstance(error.exception,SourceNotModified)
 def test_validators_cannot_inject_headers(self):
  self.assertIsNone(cache_validator('abc\r\nAuthorization: secret'))
  self.assertEqual(cache_validator('W/"revision"'),'W/"revision"')
