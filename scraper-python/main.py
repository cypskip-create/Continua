"""Loopback-only native candidate. No production scheduler/cutover implied."""
import asyncio
import os
from continua_scraper.api import create_server
from continua_scraper.database import Database
from continua_scraper.storage import RawStorage
from continua_scraper.runtime import CollectorRuntime
from continua_scraper.config import validate_environment,boolean
from continua_scraper.event_loop import database_event_loop

async def application():
    if os.environ.get('NODE_ENV')=='production' or boolean(os.environ.get('CONTINUA_NATIVE_PRODUCTION')):raise RuntimeError('Full native migration release gate is not satisfied')
    validate_environment(os.environ)
    database=await Database.open(os.environ['DATABASE_URL'])
    try:storage=RawStorage.from_environment()
    except BaseException:await database.close();raise
    runtime=CollectorRuntime(database,storage,scheduler_enabled=False)
    app=create_server(runtime,operator_key=os.environ.get('SCRAPER_ADMIN_API_KEY',''),market_key=os.environ.get('COLLECTOR_MARKET_KEY',''),release_ready=False,revision=os.environ.get('NATIVE_CANDIDATE_REVISION'))
    async def cleanup(app):await runtime.close()
    app.on_cleanup.append(cleanup)
    return app

if __name__=='__main__':
    from aiohttp import web
    web.run_app(application(),host='127.0.0.1',port=4081,access_log=None,loop=database_event_loop())
