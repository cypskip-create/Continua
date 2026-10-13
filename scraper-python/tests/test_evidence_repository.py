import contextlib
import json
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.artifacts import EvidenceRepository

class EvidenceDatabase:
    def __init__(self):
        self.calls=[]
        self.in_transaction=False
        self.committed=False
        self.fail_url=False

    @contextlib.asynccontextmanager
    async def transaction(self):
        self.in_transaction=True
        try:
            yield self
            self.committed=True
        finally:
            self.in_transaction=False

    async def query(self,sql,params=()):
        self.calls.append((sql,params))
        if "INSERT INTO scraping.raw_artifacts" in sql:
            if not self.in_transaction:
                raise AssertionError("artifact write outside transaction")
            return [{"id":42,"source_id":"fixture","sha256":"a"*64,"storage_path":"r2://private/fixture.pdf","is_new":False}]
        if "INSERT INTO scraping.artifact_urls" in sql and self.fail_url:
            raise RuntimeError("fixture attribution failure")
        if "INSERT INTO scraping.extractions" in sql:
            return [{"id":101,"artifact_id":42,"needs_review":True}]
        return []

class EvidenceTests(unittest.IsolatedAsyncioTestCase):
    def artifact(self):
        return {"sourceId":"fixture","adapter":"fixture","sha256":"a"*64,"documentUrl":"https://fixture.example/report.pdf",
            "storagePath":"r2://private/fixture.pdf","crawlerVersion":"native-fixture","metadata":{"fixture":True}}

    async def test_hash_upsert_and_attribution_are_atomic_and_keep_artifact_id(self):
        database=EvidenceDatabase()
        result=await EvidenceRepository(database).upsert_artifact(self.artifact())
        self.assertFalse(result["isNew"])
        self.assertEqual(result["artifact"]["id"],42)
        self.assertTrue(database.committed)
        self.assertIn("ON CONFLICT(source_id,sha256)",database.calls[0][0])
        self.assertEqual(database.calls[1][1],(42,"https://fixture.example/report.pdf"))

    async def test_attribution_failure_does_not_commit_partial_artifact(self):
        database=EvidenceDatabase()
        database.fail_url=True
        with self.assertRaises(RuntimeError):
            await EvidenceRepository(database).upsert_artifact(self.artifact())
        self.assertFalse(database.committed)

    async def test_extraction_versions_are_inserted_never_updated(self):
        database=EvidenceDatabase()
        input={"artifactId":42,"method":"native_pdf_text","confidence":0.4,"parserVersion":"native-fixture","text":"fixture","needsReview":True}
        repository=EvidenceRepository(database)
        for _ in range(2):
            await repository.insert_extraction(input)
        self.assertEqual(len(database.calls),2)
        self.assertTrue(all("INSERT INTO scraping.extractions" in sql and "UPDATE" not in sql for sql,_ in database.calls))
        self.assertTrue(all(params[-1] is True for _,params in database.calls))

    async def test_r2_unextracted_does_not_require_supabase_object_and_applies_retry_cooldown(self):
        database=EvidenceDatabase()
        await EvidenceRepository(database).unextracted(driver="r2")
        sql,params=database.calls[0]
        self.assertEqual(params,(False,"scraper-raw",50))
        self.assertIn("last_failed>now()-interval '1 hour'",sql)
        self.assertIn("ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1",sql)

if __name__=="__main__":unittest.main()
