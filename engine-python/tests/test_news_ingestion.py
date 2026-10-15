import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.news import classify_news_category,news_ingestion_input

class IngestionTests(unittest.TestCase):
    def test_keyword_scores_and_priority_ties(self):
        self.assertEqual(classify_news_category('profit board'),'earnings')
        self.assertEqual(classify_news_category('Treasury inflation budget'),'economy')
        self.assertEqual(classify_news_category('board appoints CEO'),'companies')
        self.assertEqual(classify_news_category('Unclassified literal prose'),'markets')
    def test_literal_issuer_and_image_are_preserved_and_excerpt_uses_utf16(self):
        row={'title':'KCB Group posts annual profit','text':'KCB Group posts annual results for shareholders. '+ '😀'*400,'documentUrl':'https://fixture.example/news','sourceId':'fixture','artifactId':1,'extractionId':2,'confidence':None,'entity':{'imageUrl':'https://fixture.example/photo.jpg'},'publishedAt':None}
        result=news_ingestion_input(row,[{'securityId':'NSE:KCB','symbol':'KCB','companyName':'KCB Group PLC'}])
        self.assertEqual(result['securityIds'],['NSE:KCB'])
        self.assertFalse(result['needsReview'])
        self.assertEqual(result['imageUrl'],row['entity']['imageUrl'])
        self.assertEqual(len(result['excerpt'].encode('utf-16-le',errors='surrogatepass'))//2,400)
    def test_unresolved_articles_are_flagged_without_invented_ticker_or_image(self):
        row={'title':'Inflation update','text':'Inflation increased during the reported observation period.','documentUrl':'https://fixture.example/a','sourceId':'fixture','artifactId':1,'extractionId':2}
        result=news_ingestion_input(row,[])
        self.assertTrue(result['needsReview']);self.assertEqual(result['securityIds'],[]);self.assertIsNone(result['imageUrl'])
