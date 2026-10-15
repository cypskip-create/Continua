import os
import pathlib
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.browser_worker import render

class BrowserProfileTests(unittest.TestCase):
    def test_each_render_uses_disposable_profile(self):
        seen=[]
        def isolated(config,profile):
            self.assertTrue(pathlib.Path(profile).is_dir())
            self.assertNotEqual(profile,os.path.expanduser('~'))
            seen.append(profile)
            return {'html':'fixture'}
        with patch('continua_scraper.browser_worker._render',isolated):
            self.assertEqual(render({}),{'html':'fixture'})
            render({})
        self.assertNotEqual(*seen)
        self.assertTrue(all(not pathlib.Path(profile).exists() for profile in seen))
    def test_failure_still_removes_profile(self):
        seen=[]
        def failed(config,profile):
            seen.append(profile)
            raise ValueError('fixture')
        with patch('continua_scraper.browser_worker._render',failed):
            with self.assertRaises(ValueError):render({})
        self.assertFalse(pathlib.Path(seen[0]).exists())
