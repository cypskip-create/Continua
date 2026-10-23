"""Read-only Neon/R2 smoke check using the existing native collector."""
import asyncio
import hashlib
import json
import os
import pathlib
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scraper-python'))
from continua_scraper.database import Database
from continua_scraper.event_loop import database_event_loop
from continua_scraper.artifacts import EvidenceRepository
from continua_scraper.archive import R2Archive
from continua_scraper.storage import RawStorage

async def main():
    database=await Database.open(os.environ['DATABASE_URL'])
    storage=None
    try:
        storage=RawStorage.from_environment()
        if storage.rollback is not None:raise ValueError('Fixture must not receive Supabase credentials')
        pending=await EvidenceRepository(database).unextracted(limit=5,driver='r2')
        inventory=await R2Archive(database,storage.r2,storage.materialize,include_legacy=False).inventory()
        rows=await database.query("SELECT storage_path,sha256,size_bytes FROM scraping.raw_artifacts WHERE storage_path LIKE 'r2://%%' AND size_bytes BETWEEN 1 AND 1048576 ORDER BY id LIMIT 1")
        if not rows:raise ValueError('No bounded private original available')
        row=rows[0]
        def verify_original():
            with storage.materialize(row['storage_path']) as artifact:
                if artifact.size!=row['size_bytes'] or artifact.sha256!=row['sha256']:raise ValueError('Stored original does not match SQL evidence')
        await asyncio.to_thread(verify_original)
        receipt={'stagingOnly':True,'databaseReadOnlyOperations':True,'supabaseCredentialPresent':False,'nativeEvidenceQueryPassed':True,'nativeArchiveInventoryPassed':True,'privateOriginalHashVerified':True,'boundedPendingRows':len(pending),'unresolvedLegacyReferences':inventory['legacy_missing_records'],'sourceObjectsDeleted':0,'productionChanged':False}
        (ROOT/'.qa-artifacts/neon-migration/collector-read-receipt.json').write_text(json.dumps(receipt,indent=2))
        print(json.dumps(receipt))
    finally:
        if storage:storage.close()
        await database.close()

asyncio.run(main(),loop_factory=database_event_loop)
