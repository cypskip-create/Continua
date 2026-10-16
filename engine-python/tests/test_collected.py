import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.collected import process_evidence,number,DESTINATIONS


def evidence(tab='Financials',tables=None,**changes):
    return dict({'entity':{'ticker':'COOP'},'sourceUrl':'https://kenyanstocks.com/stock/nse/COOP?tab='+tab,
        'contentType':'text/html','metadata':{'tab':tab},'tables':tables or [],'text':'','observedAt':'2026-10-16T08:00:00Z'},**changes)


class CollectedTests(unittest.TestCase):
    def test_all_tabs_have_processing_destinations_including_dynamic_tabs(self):
        for tab,destination in DESTINATIONS.items():
            result=process_evidence(evidence(tab),today='2026-10-16')
            self.assertEqual(result['destination'],destination)
        self.assertEqual(process_evidence(evidence('New publisher tab'))['destination'],'additionalResearch')

    def test_year_series_are_chronological_precise_and_do_not_fill_missing_values(self):
        table={'kind':'publisher_table','category':'Profit/Loss','columns':['Item','2025','2024','2023'],
            'rows':[{'label':'Revenue','cells':[{'raw':'KES 10.25 B'},{'raw':'KES 9 B'},{'raw':'—'}]}]}
        result=process_evidence(evidence(tables=[table]),today='2026-10-16')
        points=result['charts'][0]['points']
        self.assertEqual([p['year'] for p in points],[2023,2024,2025])
        self.assertIsNone(points[0]['value'])
        self.assertEqual(points[2]['value'],10250000000)
        self.assertTrue(points[2]['approximate'])
        self.assertAlmostEqual(result['charts'][0]['growthPercent'],13.8888888889)

    def test_all_financial_categories_keep_their_identity(self):
        for category in ('Profit/Loss','Cash Flow','Assets','Liabilities',"Shareholder's Equity"):
            result=process_evidence(evidence(tables=[{'kind':'publisher_table','category':category,'columns':['Item','2025'],
                'rows':[{'label':'Total','values':['0']}]}]))
            self.assertEqual(result['tables'][0]['category'],category)
            self.assertEqual(result['charts'][0]['points'][0]['value'],0)

    def test_nonconsecutive_years_and_mixed_units_never_create_growth(self):
        table={'kind':'publisher_table','columns':['Item','2025','2021'], 'rows':[{'label':'Total','values':['100','50']}]}
        result=process_evidence(evidence(tables=[table]))
        self.assertIsNone(result['charts'][0]['growthPercent'])
        table['rows'][0]['values']=['10%','KES 5']
        self.assertEqual(process_evidence(evidence(tables=[table]))['charts'],[])
        table['columns']=['Item','2025','2025']
        self.assertEqual(process_evidence(evidence(tables=[table]))['charts'],[])

    def test_history_is_sorted_validated_and_conflicting_dates_are_not_published(self):
        a={'date':'2026-10-15','open':10,'high':12,'low':9,'close':11,'volume':1200,'volumeApproximate':True}
        b=dict(a,date='2026-10-14')
        rows=[a,b,dict(a,date='2026-10-13',low=13),dict(a,date='2027-01-01'),dict(b,close=10)]
        result=process_evidence(evidence('Historical Data',[{'kind':'publisher_ohlcv','observations':rows}]),today='2026-10-16')
        self.assertEqual([r['date'] for r in result['history']],['2026-10-15'])
        self.assertEqual(result['issues'][0]['count'],3)
        self.assertEqual(result['history'][0]['adjustment'],'unknown')

    def test_holders_preserve_names_shares_percent_and_raw_value_without_guessing_units(self):
        table={'kind':'publisher_table','columns':['Name','Shares','Ownership %','Value (KES)'],
            'rows':[{'label':'Holder One','values':['3.79 B','64.56%','KES 138.63']} ]}
        result=process_evidence(evidence('Holders',[table]))
        self.assertEqual(result['destination'],'ownership')
        self.assertEqual(result['tables'][0]['rows'][0]['values'],table['rows'][0]['values'])
        self.assertEqual(result['charts'],[])

    def test_news_links_and_files_are_https_and_no_private_storage_is_exposed(self):
        rows=[{'kind':'publisher_news','entries':[{'title':'Headline','url':'https://publisher.example/article','summary':'Excerpt'},
            {'title':'Unsafe','url':'javascript:bad'}]}, {'kind':'publisher_view','files':[{'title':'Annual','url':'https://assets.kenyanstocks.com/annual.pdf'},
            {'url':'r2://private/annual.pdf'},{'url':'https://other.example/a.pdf'}]}]
        result=process_evidence(evidence('News',rows))
        self.assertEqual(len(result['news']),1)
        self.assertEqual(len(result['files']),1)

    def test_chart_snapshot_is_retained_only_when_label_value_lengths_match(self):
        table={'kind':'publisher_view','charts':[{'labels':['2024','2025'],'datasets':[{'label':'Revenue','data':[12,14]},
            {'label':'Broken','data':[1]},{'label':'Infinite','data':[1,float('inf')]}]}]}
        result=process_evidence(evidence('Statistics',[table]))
        self.assertEqual(len(result['charts']),1)
        self.assertEqual(result['charts'][0]['unit'],'publisher_chart_units')

    def test_pdf_every_layout_has_classification_page_headings_and_review_state(self):
        for method in ('native_pdf_text','ocr'):
            row=evidence('Files',contentType='application/pdf',method=method,
                text='ANNUAL REPORT 2025\nCONSOLIDATED STATEMENT OF CASH FLOWS\fSHAREHOLDERS\nBOARD OF DIRECTORS',
                tables=[{'headerLine':'Item | 2025 | 2024','rows':[{'label':'Revenue','values':['100','90']}]}])
            result=process_evidence(row)
            self.assertEqual(result['status'],'review_required')
            self.assertEqual(result['charts'],[])
            self.assertEqual(result['documents'][0]['pageCount'],2)
            self.assertIn('annualReport',result['documents'][0]['kinds'])
            self.assertIn('ownership',result['documents'][0]['kinds'])
            self.assertEqual(result['tables'][0]['status'],'review_required')
            self.assertNotIn('text',result['documents'][0])

    def test_scope_and_source_are_required_and_aliases_resolve(self):
        self.assertEqual(process_evidence(evidence(entity={'ticker':'DTK'},sourceUrl='https://kenyanstocks.com/stock/nse/DTK'))['symbol'],'DTB')
        for row in (evidence(entity={}),evidence(sourceUrl='http://bad'),evidence(sourceUrl='https://user:pass@example.com')):
            with self.assertRaises(ValueError):process_evidence(row)

    def test_number_parsing_missing_negative_zero_and_invalid_signs(self):
        self.assertEqual(number('(1.25 B)')['value'],-1250000000)
        self.assertEqual(number('(1.25) B')['value'],-1250000000)
        self.assertEqual(number('0')['value'],0)
        for raw in ('—','NaN','Infinity','(12','(-12)',True):self.assertIsNone(number(raw))


if __name__=='__main__':unittest.main()
