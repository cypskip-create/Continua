"""Owned-schema native Python connectivity check, in a read-only transaction."""
import asyncio
import json
import logging
import os
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/"scraper-python"))
from continua_scraper.database import Database

async def main():
    database=await Database.open(os.environ["DATABASE_URL"])
    try:
        async with database.transaction() as connection:
            await connection.query("SET TRANSACTION READ ONLY")
            source=(await connection.query("SELECT count(*)::int AS count FROM scraping.sources WHERE enabled=true"))[0]["count"]
            artifact=(await connection.query("SELECT count(*)::int AS count FROM scraping.raw_artifacts"))[0]["count"]
            extraction=(await connection.query("SELECT count(*)::int AS count FROM scraping.extractions"))[0]["count"]
        print(json.dumps({"nativePythonPostgreSQL":True,"transactionReadOnly":True,"enabledSources":source,"artifacts":artifact,"extractionVersions":extraction}))
    finally:
        await database.close()

if __name__=="__main__":
    logging.getLogger("psycopg.pool").setLevel(logging.CRITICAL)
    try:
        if sys.platform=="win32":
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({"nativePythonPostgreSQL":False,"errorClass":type(error).__name__}))
        sys.exit(1)
