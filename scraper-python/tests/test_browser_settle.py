import json
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.browser_settle import PublisherSettle


def event(method, **params):
    return {'message': json.dumps({'message': {'method': method, 'params': params}})}


class SettleTests(unittest.TestCase):
    def test_pending_and_dom_mutations_cannot_be_mistaken_for_complete_data(self):
        clock = [0]
        monitor = PublisherSettle(clock=lambda: clock[0])
        self.assertFalse(monitor.observe([event('Network.requestWillBeSent', requestId='fetch', type='Fetch')], [1, 2]))
        clock[0] = 5
        self.assertFalse(monitor.observe([], [1, 2]))
        self.assertFalse(monitor.observe([event('Network.loadingFinished', requestId='fetch')], [1, 3]))
        clock[0] = 6
        self.assertTrue(monitor.observe([], [1, 3]))
        self.assertFalse(monitor.observe([], [1, 4]))
        clock[0] = 7
        self.assertFalse(monitor.observe([], [1, 4], busy=True))
        self.assertTrue(monitor.observe([], [1, 4]))

    def test_failed_requests_release_and_http_error_rejects(self):
        clock = [0]
        monitor = PublisherSettle(clock=lambda: clock[0])
        monitor.observe([event('Network.requestWillBeSent', requestId='font', type='Font'), event('Network.loadingFailed', requestId='font')], [1])
        clock[0] = 1
        self.assertTrue(monitor.observe([], [1]))
        with self.assertRaises(ValueError):
            monitor.observe([event('Network.responseReceived', type='Document', response={'status': 429})], [1])
