"""Private native source transport. No sessions, payments or user data access."""
import asyncio
import re
import time
from .mystocks import MyStocksAdapter

class MarketSource:
    def __init__(self,runtime):
        self.runtime=runtime
        self.slots=asyncio.Semaphore(1)
        self.quote_refreshes={};self.quote_requested_at={}

    async def read(self,data):
        if not isinstance(data,dict) or set(data)-{'sourceId','operation','symbols','symbol','interval','from','to','since'}:
            raise ValueError('Invalid source request')
        source_id=data.get('sourceId');operation=data.get('operation')
        if not isinstance(source_id,str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,200}',source_id):raise ValueError('Invalid source identifier')
        if operation not in ('securities','quotes','refresh-quotes','profile','financials','actions','earnings','ownership','candles'):raise ValueError('Invalid source operation')
        source=await self.runtime.sources.get(source_id)
        config=(source or {}).get('config') or {}
        if not source or not source['enabled'] or source['adapter'] not in ('mystocks','afx') or source.get('redistributionAllowed') is not True or not isinstance(config.get('permissionReference'),str) or not 1<=len(config['permissionReference'].strip())<=200:
            raise PermissionError('Source permission unavailable')
        symbol=data.get('symbol')
        if symbol is not None and (not isinstance(symbol,str) or not re.fullmatch(r'[A-Z0-9.\-]{1,20}',symbol)):raise ValueError('Invalid source ticker')
        if operation=='securities':return await self.securities()
        if operation=='quotes':return await self.quotes(source,data.get('symbols',[]))
        if operation=='refresh-quotes':return self.refresh_quotes(source)
        if operation=='profile':return await self.profile(source,symbol)
        # These public transports do not supply genuine issuer statements,
        # actions, earnings calendars or holder records. The separate native
        # PDF/tab publication paths supply those facts when validated.
        if operation in ('financials','actions','earnings','ownership'):return []
        if operation=='candles':
            # Their history supplies closes, not complete OHLCV. It is retained
            # and published through observed_daily_closes, never flat candles.
            return []
        raise ValueError('Unsupported source operation')

    def refresh_quotes(self,source):
        config=source.get('config') or {};identifier=source['id']
        if source['adapter']!='mystocks' or config.get('collectionMode','quotes')!='quotes' or config.get('quoteMappingApproved')!='mystocks-literal-observations-v1':
            raise PermissionError('Source quote mapping unavailable')
        scheduler=self.runtime.scheduler
        if not scheduler.enabled:return {'accepted':False,'reason':'scheduler_disabled'}
        active=self.quote_refreshes.get(identifier)
        if active is not None and not active.done():return {'accepted':True,'alreadyRunning':True}
        now=time.monotonic()
        if now-self.quote_requested_at.get(identifier,-300)<300:return {'accepted':False,'reason':'cooldown'}
        if identifier not in self.quote_requested_at and len(self.quote_requested_at)>=1000:raise ValueError('Source refresh capacity exceeded')
        # The collector owns the bounded source queue and immutable R2 writes.
        # The API responds immediately: slow source polling cannot occupy the
        # backend's serial publication/research worker for several minutes.
        task=scheduler.spawn(scheduler.source_once(source))
        self.quote_refreshes[identifier]=task;self.quote_requested_at[identifier]=now
        return {'accepted':True,'alreadyRunning':False}

    async def securities(self):
        rows=await self.runtime.database.query("""SELECT s.symbol,s.status,s.currency,s.isin,c.name AS company_name,sector.name AS sector
          FROM market.securities s JOIN market.companies c ON c.id=s.company_id
          LEFT JOIN market.sectors sector ON sector.id=c.sector_id WHERE s.exchange='NSE' ORDER BY s.symbol LIMIT 1001""")
        if len(rows)>1000:raise ValueError('Issuer directory budget')
        result=[]
        for row in rows:
            value={'Symbol':row['symbol'],'CompanyName':row['company_name'],'Currency':row['currency'],'TradingStatus':row['status'].upper()}
            if row.get('isin'):value['ISIN']=row['isin']
            if row.get('sector'):value['Sector']=row['sector']
            result.append(value)
        return result

    async def quotes(self,source,symbols):
        if not isinstance(symbols,list) or len(symbols)>10 or any(not isinstance(s,str) or not re.fullmatch(r'[A-Z0-9.\-]{1,20}',s) for s in symbols):raise ValueError('Quote source batch must contain at most ten tickers')
        if not symbols:return []
        config=source.get('config') or {}
        if source['adapter']!='mystocks' or config.get('quoteMappingApproved')!='mystocks-literal-observations-v1':raise PermissionError('Quote mapping approval unavailable')
        async with self.slots:
            async with asyncio.timeout(55):
                adapter=await self.runtime.registry.build(source['id'])
                if not isinstance(adapter,MyStocksAdapter) or getattr(adapter,'persistent_batch_size',None) is not None:raise ValueError('Quote source mode mismatch')
                adapter.universe=list(dict.fromkeys(symbols))
                await self.runtime.runner.run(adapter)
        rows=await self.runtime.database.query("""SELECT DISTINCT ON(sec.symbol) sec.symbol,sec.status,c.payload
          FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources src ON src.id=a.source_id
          JOIN market.securities sec ON sec.symbol=e.entity->>'ticker' AND sec.exchange='NSE' AND sec.status<>'delisted'
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.tables)='array' THEN e.tables ELSE '[]'::jsonb END) c(payload)
          WHERE a.source_id=%s AND src.enabled AND src.redistribution_allowed=true
          AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200
          AND src.config->>'quoteMappingApproved'='mystocks-literal-observations-v1'
          AND e.parser_version='mystocks-literal-observations-v1' AND sec.symbol=ANY(%s)
          AND c.payload->>'kind'='market_quote_candidate' AND c.payload->>'symbol'=sec.symbol
          AND a.storage_path LIKE 'r2://continua-financial-documents/%%'
          ORDER BY sec.symbol,c.payload->>'timestamp' DESC,e.id DESC""",(source['id'],symbols))
        result=[]
        fields={'LastTradedPrice':'lastPrice','PrevClose':'previousClose','Open':'open','High':'high','Low':'low','Change':'change','ChangePct':'changePercent','Volume':'volume','Currency':'currency','EventTimestamp':'timestamp'}
        for row in rows:
            payload=row['payload']
            if not isinstance(payload,dict):continue
            result.append({'Symbol':row['symbol'],'TradingStatus':row['status'].upper(),'ObservationSource':'delayed',**{key:payload[value] for key,value in fields.items() if value in payload}})
        return result

    async def profile(self,source,symbol):
        if symbol is None:raise ValueError('Profile ticker required')
        if source['adapter']!='afx' or (source.get('config') or {}).get('profileMappingApproved')!='afx-publisher-profile-v1':return None
        provider_symbol={'DTB':'DTK','STANBIC':'SBIC','HFCB':'HFCK'}.get(symbol,symbol)
        rows=await self.runtime.database.query("""SELECT c.payload FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
          JOIN scraping.sources src ON src.id=a.source_id
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.tables)='array' THEN e.tables ELSE '[]'::jsonb END) c(payload)
          WHERE a.source_id=%s AND e.entity->>'ticker'=ANY(%s) AND c.payload->>'kind'='publisher_profile'
          AND src.enabled AND src.redistribution_allowed=true
          AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200
          AND src.config->>'profileMappingApproved'='afx-publisher-profile-v1'
          AND a.storage_path LIKE 'r2://continua-financial-documents/%%'
          AND octet_length(c.payload::text)<=65536
          ORDER BY e.id DESC LIMIT 1""",(source['id'],list(dict.fromkeys([symbol,provider_symbol]))))
        if not rows:return None
        facts=(rows[0]['payload'] or {}).get('facts') or {}
        return {'Symbol':symbol,**{target:facts[field] for field,target in [('address','Headquarters'),('website','Website')] if isinstance(facts.get(field),str)}}
