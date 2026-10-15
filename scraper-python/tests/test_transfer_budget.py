import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.transfer_budget import TransferBudget,TransferLimitReached,MeteredReader
from continua_scraper import transfer_budget
import asyncio

class TransferTests(unittest.IsolatedAsyncioTestCase):
    async def test_shared_directions_and_ceiling(self):
        budget=TransferBudget(8)
        budget.consume('uploadBytes',3);budget.consume('downloadBytes',5)
        with self.assertRaises(TransferLimitReached):budget.consume('uploadBytes',1)
        self.assertEqual(budget.snapshot()['downloadBytes'],5)
        self.assertTrue(budget.exhausted)
        with self.assertRaises(TransferLimitReached):budget.consume('downloadBytes',0)
    async def test_reader_counts_wire_bytes(self):
        reader=asyncio.StreamReader();reader.feed_data(b'abc\nxyz');reader.feed_eof()
        previous=transfer_budget.active;transfer_budget.active=TransferBudget(7)
        try:
            wrapped=MeteredReader(reader)
            self.assertEqual(await wrapped.readline(),b'abc\n')
            self.assertEqual(await wrapped.readexactly(3),b'xyz')
            self.assertEqual(transfer_budget.active.snapshot()['downloadBytes'],7)
        finally:transfer_budget.active=previous
