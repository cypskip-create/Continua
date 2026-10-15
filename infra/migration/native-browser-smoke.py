"""Read-only public-source smoke through the actual native browser boundary.

No user browser profile, cloud credentials, database writes or R2 writes. The
collector integration/storage gates remain separate from this transport probe.
"""
import argparse
import asyncio
import json
import pathlib
import re
import sys
import time

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scraper-python'))
from continua_scraper.browser import BrowserRenderer
from continua_scraper.download import Downloader
from continua_scraper.policy import SourcePolicy
from continua_scraper.serial import SerialWorkQueue
from continua_scraper.tables import stock_tables
from continua_scraper.tabs import STOCK_TABS,FINANCIAL_CATEGORIES,stock_tab_documents
from continua_scraper.browser_proxy import BrowserProxy
from continua_scraper.html import kenyan_file_links

async def probe(args):
    if not re.fullmatch(r'[A-Z0-9-]{1,20}',args.ticker):raise ValueError('Invalid issuer')
    category=args.category if args.tab=='Financials' else None
    documents=stock_tab_documents('https://kenyanstocks.com/stock/nse/'+args.ticker,[args.tab],[category] if category else [])
    if len(documents)!=1:raise ValueError('Probe requires one publisher view')
    policy=SourcePolicy('kenyanstocks-native-qa',('kenyanstocks.com','assets.kenyanstocks.com'),True,
        user_agent='ContinuaBot/1.0 (+https://github.com/cypskip-create/Continua)',collection_allowed=True,allow_subdomains=True)
    queue=SerialWorkQueue(max_waiting=1)
    renderer=BrowserRenderer(queue,Downloader(policy),chromium=args.chromium,driver=args.driver)
    start=time.monotonic()
    try:
        context=documents[0]['context']
        async with asyncio.timeout(180):
            if args.in_process_diagnostic:
                # QA-only diagnostic: same fresh browser/source proxy, while
                # exposing only exception type instead of private diagnostics.
                from continua_scraper.browser_worker import render
                if not await renderer.downloader.robots_allowed(documents[0]['url']):raise PermissionError('Publisher robots disallows probe')
                async with BrowserProxy(policy) as proxy:
                    result=await asyncio.to_thread(render,{'url':documents[0]['url'],'options':{'stock_tab':args.tab,'category':category,'history_start':context['historyStart']},'proxyPort':proxy.port,'userAgent':policy.user_agent,'chromium':args.chromium,'driver':args.driver})
            else:result=await renderer.render(documents[0]['url'],stock_tab=args.tab,category=category,history_start=context['historyStart'])
        tables=stock_tables(result['html'],args.tab,category)
        files=kenyan_file_links(result['html'],result['finalUrl']) if args.tab=='Files' else []
        print(json.dumps({'nativeBrowser':True,'source':'kenyanstocks','ticker':args.ticker,'tab':args.tab,'category':category,
            'elapsedSeconds':round(time.monotonic()-start,3),'htmlBytes':len(result['html'].encode()),'parsedTables':len(tables),
            'discoveredFiles':len(files),'coverage':result.get('coverage'),'cloudWrites':False,'productionCutover':False}))
        if not result.get('coverage',{}).get('networkAndDOMSettled'):raise ValueError('Unsettled publisher view')
        if args.tab in ('Financials','Historical Data') and not tables:raise ValueError('Publisher table coverage unavailable')
        if args.tab=='Files' and not files:raise ValueError('Publisher file coverage unavailable')
    finally:await queue.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--chromium',required=True);parser.add_argument('--driver',required=True)
    parser.add_argument('--ticker',default='COOP');parser.add_argument('--tab',choices=STOCK_TABS,default='Financials')
    parser.add_argument('--category',choices=FINANCIAL_CATEGORIES,default='Profit/Loss')
    parser.add_argument('--in-process-diagnostic',action='store_true')
    args=parser.parse_args()
    try:asyncio.run(probe(args))
    except Exception as error:
        codes={'Publisher view did not settle or expose requested controls':'publisher-view-timeout','Native browser dependency failed':'browser-dependency','Publisher returned an HTTP error':'publisher-http','Native publisher rendering failed':'browser-worker','Publisher table coverage unavailable':'missing-tables','Publisher requested control unavailable':'publisher-control','Native browser rejected configuration':'browser-configuration','Publisher DOM script failed':'publisher-script','Native browser executable unavailable':'browser-executable','Native browser protocol field unavailable':'browser-protocol','Native browser execution denied':'browser-permission','Native browser validation failed':'browser-validation'}
        print(json.dumps({'passed':False,'stage':'native-browser-source-probe','errorClass':type(error).__name__,'errorCode':codes.get(str(error),'source-probe-failed'),'cloudWrites':False,'productionCutover':False}),file=sys.stderr)
        sys.exit(1)
