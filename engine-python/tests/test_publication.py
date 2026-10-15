import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.publication import validate_historical_confirmation,resolve_company_entity
from continua_engine.reports import native_annual_report

REPORT="""Example Issuer PLC
Approved on 1 March 2026
CONSOLIDATED STATEMENT OF COMPREHENSIVE INCOME
For the year ended 31 December 2025
KShs '000
2025    2024
Revenue    120,000    100,000
Profit before tax    30,000    25,000
Income tax expense    (9,000)    (7,500)
Profit after tax    21,000    17,500
Earnings per share (KShs)    2.10    1.75
\fCONSOLIDATED STATEMENT OF FINANCIAL POSITION
As at 31 December 2025
KShs '000
2025    2024
Total assets    300,000    250,000
Total liabilities    100,000    90,000
Total equity    200,000    160,000"""

class PublicationTests(unittest.TestCase):
    def test_report_explicit_years_and_units_preserve_eps(self):
        entries=native_annual_report(REPORT,'Example Issuer PLC','NSE:EXAMPLE')
        self.assertEqual(len(entries),2)
        self.assertEqual(entries[0]['confirmation']['periods'][0]['income'],{'revenue':120e6,'netIncome':21e6,'eps':2.1})
        self.assertEqual(entries[1]['confirmation']['periods'][1]['sourcePage'],2)
        self.assertEqual(entries[1]['confirmation']['periods'][1]['period']['periodEnd'],'2024-12-31')

    def test_layout_scope_dates_issuer_and_reconciliation_reject_guessing(self):
        mutations=[REPORT.replace("KShs '000",'Unknown units',1),REPORT.replace('120,000','12O,000'),REPORT.replace('200,000','201,000'),REPORT.replace('21,000','22,000'),REPORT.replace('2025    2024','2024    2025',1),REPORT.replace('1 March 2026','1 January 2025'),REPORT.replace('Earnings per share (KShs)','Earnings per share'),REPORT.replace('COMPREHENSIVE INCOME','COMPREHENSIVE INCOME\nCompany 2025 Group 2024')]
        for text in mutations:
            with self.assertRaises(ValueError):native_annual_report(text,'Example Issuer PLC','NSE:EXAMPLE')
        with self.assertRaises(ValueError):native_annual_report(REPORT,'Different Issuer PLC','NSE:EXAMPLE')

    def test_unresolved_manual_candidate_is_not_canonical_issuer_proof(self):
        companies=[{'companyId':'a','securityId':'NSE:KCB','name':'KCB Group PLC'},{'companyId':'b','securityId':'NSE:OTHER','name':'KCB Holdings Limited'}]
        self.assertIsNone(resolve_company_entity('KCB',companies))
        self.assertIsNone(resolve_company_entity('',companies))
        self.assertEqual(resolve_company_entity('Different Issuer PLC',[{'companyId':'a','securityId':'NSE:DIFF','name':'Different Issuer Limited'}]),{'companyId':'a','securityId':'NSE:DIFF'})

if __name__=='__main__':unittest.main()
