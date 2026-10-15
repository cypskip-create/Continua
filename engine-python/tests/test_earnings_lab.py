import unittest
from continua_engine.labs import earnings_lab

class EarningsLabTests(unittest.TestCase):
    def setUp(self):
        self.raw={'symbol':'KCB','years':3,'growthPercent':10,'exitPe':8}
        self.bundle={'currency':'KES','quote':{'lastPrice':40,'timestamp':'2026-10-14T09:00:00Z','source':'delayed'},'history':[{'fiscalYear':2025,'periodEnd':'2025-12-31','reportedAt':'2026-03-01','eps':5,'sourceUrls':['https://issuer.example/report.pdf']}],'reliability':{'snapshotId':'fixture'}}
        self.now='2026-10-14T12:00:00Z'

    def test_sourced_annual_basis(self):
        result=earnings_lab(self.raw,self.bundle,self.now)
        self.assertEqual(result['status'],200)
        self.assertEqual(result['data']['fiscalYear'],2025)
        self.assertEqual(len(result['data']['cells']),9)
        self.assertEqual(result['data']['assumptions']['eps'],5)

    def test_no_future_or_unsourced_filing(self):
        self.bundle['history'][0]['reportedAt']='2026-12-01'
        self.assertEqual(earnings_lab(self.raw,self.bundle,self.now)['status'],422)
        self.bundle['history'][0]['reportedAt']='2026-03-01'
        self.bundle['history'][0]['sourceUrls']=[]
        self.assertEqual(earnings_lab(self.raw,self.bundle,self.now)['status'],422)

    def test_no_mock_or_future_quote(self):
        self.bundle['quote']['source']='mock'
        self.assertEqual(earnings_lab(self.raw,self.bundle,self.now)['status'],422)
        self.bundle['quote']['source']='delayed'
        self.bundle['quote']['timestamp']='2026-10-15T09:00:00Z'
        self.assertEqual(earnings_lab(self.raw,self.bundle,self.now)['status'],422)

    def test_strict_bounded_assumptions(self):
        for key,value in [('years',True),('years',11),('growthPercent',float('nan')),('exitPe',0),('extra',1)]:
            self.assertEqual(earnings_lab({**self.raw,key:value},self.bundle,self.now)['status'],400)
