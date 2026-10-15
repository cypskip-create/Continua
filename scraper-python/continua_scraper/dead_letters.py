"""Durable private failure audit; never emit provider error text to public logs."""
from .artifacts import mapped

class DeadLetters:
    def __init__(self,database):self.database=database

    async def record(self,source_id,url,stage,reason):
        if stage not in ('fetch','parse','discover','store'):
            raise ValueError('Invalid failure stage')
        await self.database.query("""INSERT INTO scraping.dead_letters(source_id,url,stage,reason,attempts,first_failed,last_failed)
          VALUES(%s,%s,%s,%s,1,now(),now()) ON CONFLICT(source_id,url,stage) DO UPDATE SET
          reason=EXCLUDED.reason,attempts=scraping.dead_letters.attempts+1,last_failed=now()""",(source_id,url,stage,str(reason)[:1000]))

    async def list(self,source_id=None,limit=100):
        if type(limit) is not int or not 1<=limit<=100:raise ValueError('Invalid failure batch')
        fields={'id':'id','source_id':'sourceId','url':'url','stage':'stage','reason':'reason','attempts':'attempts','last_failed':'lastFailed'}
        sql='SELECT * FROM scraping.dead_letters'
        args=()
        if source_id is not None:sql+=' WHERE source_id=%s';args=(source_id,)
        rows=await self.database.query(sql+' ORDER BY last_failed DESC LIMIT %s',(*args,limit))
        return [mapped(row,fields) for row in rows]
