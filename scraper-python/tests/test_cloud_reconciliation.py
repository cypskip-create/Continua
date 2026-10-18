import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from reconcile_cloud import reconciliation_limits


class ReconciliationLimitsTests(unittest.TestCase):
    def test_migration_allowance_is_separate_from_normal_collection(self):
        env={'COLLECTOR_RUN_TRANSFER_BYTES':str(16*1024**2),'COLLECTOR_DAILY_TRANSFER_BYTES':str(192*1024**2)}
        self.assertEqual(reconciliation_limits(env,False),(16*1024**2,192*1024**2,600))
        self.assertEqual(reconciliation_limits(env,True),(384*1024**2,1024**3,600))
        self.assertEqual(env['COLLECTOR_DAILY_TRANSFER_BYTES'],str(192*1024**2))

    def test_migration_cannot_exceed_approved_run_or_daily_ceiling(self):
        for env in ({'CLOUD_MIGRATION_RUN_TRANSFER_BYTES':str(385*1024**2)},
                    {'CLOUD_MIGRATION_DAILY_TRANSFER_BYTES':str(1024**3+1)},
                    {'CLOUD_MIGRATION_DAILY_TRANSFER_BYTES':'1'},
                    {'CLOUD_MIGRATION_RUN_TRANSFER_BYTES':'0'}):
            with self.assertRaises(ValueError):reconciliation_limits(env,True)
