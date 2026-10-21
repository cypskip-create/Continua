import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.relationships import relationship_tables

class RelationshipTests(unittest.TestCase):
 def table(self):
  return {'headerLine':'From entity | From type | To entity | To type | Relationship | Effective date | Ownership percent',
   'rows':[{'label':'shareholder:registered-id','values':['shareholder','security:NSE:FIXTURE','security','owns','2024-12-31','25.5'],'sourceRow':7}]}
 def test_literal_source_cells_are_preserved_and_review_is_required(self):
  parsed=relationship_tables([self.table()])[0]['relationships'][0]
  self.assertEqual(parsed['ownershipPercent'],25.5);self.assertEqual(parsed['verification'],'pending');self.assertEqual(parsed['sourceCell']['row'],7)
 def test_generic_financial_tables_and_unresolved_names_are_not_guessed(self):
  self.assertEqual(relationship_tables([{'headerLine':'Revenue | 2024','rows':[]}]),[])
  t=self.table();t['rows'][0]['label']='An ambiguous person name';self.assertEqual(relationship_tables([t]),[])
 def test_invalid_ownership_and_approximate_prose_are_not_published(self):
  for value in ('101','about 20%','NaN','1e2'):
   t=self.table();t['rows'][0]['values'][-1]=value;self.assertEqual(relationship_tables([t]),[])

if __name__=='__main__':unittest.main()
