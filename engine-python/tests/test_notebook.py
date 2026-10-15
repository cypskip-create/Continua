import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.notebook import validate_forecast,private_calibration

class NotebookTests(unittest.TestCase):
    def test_strict_owner_free_input_and_probabilities(self):
        now='2026-10-14T12:00:00Z'
        raw={'symbol':' kcb ','question':'Will reported profit increase?','rules':'Use the audited annual filing for resolution.','deadline':'2027-01-01T00:00:00Z','probability':.6,'rationale':'Actual filing evidence.'}
        self.assertEqual(validate_forecast('create',raw,now)['data']['symbol'],'KCB')
        for changed in [{**raw,'userId':'someone-else'},{**raw,'probability':True},{**raw,'probability':1.1},{**raw,'deadline':now},{**raw,'deadline':'2027-02-30T00:00:00Z'}]:
            self.assertFalse(validate_forecast('create',changed,now)['valid'])
    def test_https_resolution_and_no_credential_urls(self):
        for source in ['http://fixture.example/a','https://user:secret@fixture.example/a','not-a-link']:
            self.assertFalse(validate_forecast('resolve',{'outcome':'yes','sourceUrl':source,'note':'Observed filing result.'},'2026-10-14T12:00:00Z')['valid'])
    def test_voids_and_post_deadline_revisions_do_not_score(self):
        row={'status':'resolved','outcome':True,'deadline':'2026-10-01T00:00:00Z','resolved_at':'2026-10-02T00:00:00Z','revisions':[{'at':'2026-09-01T00:00:00Z','probability':.5}]}
        result=private_calibration([row,{**row,'status':'void'},{**row,'revisions':[{'at':'2026-10-02T00:00:00Z','probability':1}]}])
        self.assertEqual(result['resolvedCount'],1);self.assertEqual(result['initialBrier'],.25)
        self.assertEqual(result['bins'][2]['count'],1)
