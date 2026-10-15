"""Literal quote/close observations; no invented listing dates, OHLC or volume."""
import json
import math
import re
import time
from datetime import datetime,timezone,timedelta
from urllib.parse import quote
from .html import soup

ALIASES={'DTB':'DTK','STANBIC':'SBIC','HFCB':'HFCK'}
def numeric(raw):
    if not isinstance(raw,str):return None
    raw=raw.replace(',','').strip()
    if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?',raw):return None
    v=float(raw);return v if math.isfinite(v) else None
def parse_quote(raw,symbol,now=None):
    stamp=raw.get('stamp') if isinstance(raw,dict) else None;values=raw.get('data') if isinstance(raw,dict) else None
    now=time.time() if now is None else now
    if type(stamp) not in (int,float) or not math.isfinite(stamp) or stamp<=0 or stamp>now or not isinstance(values,list) or len(values)<8:return None
    last,previous,opening,high,low=[numeric(values[i]) for i in (0,2,4,5,6)];volume=numeric(values[7])
    if any(v is None for v in (last,previous,opening,high,low,volume)) or last<=0 or previous<=0 or volume<0 or volume!=int(volume) or volume>9007199254740991 or low<0 or high<max(last,opening) or low>min(last,opening):return None
    try:at=datetime.fromtimestamp(stamp,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    except (ValueError,OverflowError,OSError):return None
    change=last-previous
    return {'kind':'market_quote_candidate','symbol':symbol,'lastPrice':last,'previousClose':previous,'open':opening,'high':high,'low':low,'volume':int(volume),'change':math.floor(change*100+.5)/100,'changePercent':math.floor(change/previous*10000+.5)/100,'currency':'KES','timestamp':at,'source':'delayed','basis':'Observed undocumented source array fields; security trading status comes from the issuer registry, not the source market-open flag.'}

def chart_closes(html,from_date,to_date,now=None):
    node=soup(html).select_one('#myStocksChart_JS')
    if node is None:return []
    model=json.loads(node.get_text(),parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite chart')))
    charts=model.get('charts',[]);chart=charts[0] if charts else {};axes=chart.get('axes',[]);labels=axes[0].get('labels',{}) if axes else {}
    layers=chart.get('layers',[]);layer=next((v for v in layers if v.get('id')==0),None) or next((v for v in layers if v.get('id')==1),{})
    closes=next((v['data'] for v in layer.get('dataSets',[]) if isinstance(v.get('data'),list)),[])
    if len(closes)>10000:raise ValueError('chart observation budget')
    now=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z') if now is None else now
    out=[]
    for i,close in enumerate(closes):
        label=labels.get(str(i));seconds=label[1] if isinstance(label,list) and len(label)>1 else None
        if type(close) not in (int,float) or not math.isfinite(close) or close<=0 or type(seconds) not in (int,float) or not math.isfinite(seconds):continue
        try:stamp=datetime.fromtimestamp((seconds/86400-719162)*86400,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        except (ValueError,OverflowError,OSError):continue
        if stamp<from_date or stamp>to_date or stamp>now:continue
        out.append({'kind':'historical_close_candidate','date':stamp[:10],'close':close,'volume':None,'basis':'Publisher daily close only; open, high, low and volume are unavailable. Not an OHLC candle.'})
    return out

class MyStocksAdapter:
    scope_extractions_by_ticker=True
    document_concurrency=2
    persistent_batch_size=None
    parser_version='mystocks-literal-observations-v1'
    def __init__(self,io,universe):self.io=io;self.id=io.source['id'];self.universe=universe
    async def discover(self):
        documents=[]
        for symbol in self.universe:
            if not isinstance(symbol,str) or not re.fullmatch(r'[A-Z0-9.\-]{1,20}',symbol):continue
            slug=ALIASES.get(symbol,symbol);url=f'https://live.mystocks.co.ke/x/f{int(time.time())//30*30}-{slug}'
            documents.append({'url':url,'discoveredFrom':'https://live.mystocks.co.ke/stock='+slug,'context':{'ticker':symbol,'kind':'quote'}})
        if len(documents)>2000:raise ValueError('market universe budget')
        return documents
    async def fetch(self,document):
        artifact=await self.io.downloader.fetch(document['url'],request_headers={'Accept':'application/json','Referer':document['discoveredFrom']})
        return await self.io.persist(document,artifact,'mystocks',self.parser_version)
    async def parse(self,fetched):
        content=self.io.text(fetched['artifact'],1024*1024);raw=json.loads(content,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite quote')))
        symbol=fetched['document']['context']['ticker'];observation=parse_quote(raw,symbol)
        if observation is None:raise ValueError('Quote mapping requires source review')
        return {'method':'json','confidence':.8,'text':'Observed quote for '+symbol,'tables':[observation],'entity':{'ticker':symbol,'exchange':'NSE'},'needsReview':True}

class MyStocksHistoryAdapter(MyStocksAdapter):
    """Separately scheduled close-only collection, never the 30-second quote job."""
    persistent_batch_size=20
    parser_version='mystocks-close-history-v1'
    async def discover(self):
        config=self.io.source.get('config') or {}
        days=config.get('historyDays',360)
        if type(days) is not int or not 1<=days<=3600:raise ValueError('History window budget')
        now=datetime.now(timezone.utc)
        end=now.isoformat(timespec='milliseconds').replace('+00:00','Z')
        start=(now-timedelta(days=days)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        documents=[]
        for symbol in self.universe:
            if not isinstance(symbol,str) or not re.fullmatch(r'[A-Z0-9.\-]{1,20}',symbol):continue
            slug=ALIASES.get(symbol,symbol)
            url='https://live.mystocks.co.ke/stock='+slug+'?historical'
            documents.append({'url':url,'discoveredFrom':url,'context':{'ticker':symbol,'kind':'historical-close','from':start,'to':end,'days':days}})
        if len(documents)>2000:raise ValueError('Market universe budget')
        return documents
    async def fetch(self,document):
        context=document['context'];symbol=context['ticker']
        if not re.fullmatch(r'[A-Z0-9.\-]{1,20}',symbol):raise ValueError('Invalid history ticker')
        slug=ALIASES.get(symbol,symbol);page='https://live.mystocks.co.ke/stock='+slug+'?historical'
        if document['url']!=page:raise ValueError('History session must use registered issuer URL')
        session_artifact=await self.io.downloader.fetch(page,request_headers={'Accept':'text/html'})
        session=await self.io.persist(document,session_artifact,'mystocks',self.parser_version)
        try:
            html=self.io.text(session_artifact,2*1024*1024)
            match=re.search(r'''\bMSPGSID\s*=\s*["']([A-Za-z0-9_-]{1,128})["']''',html)
            if match is None:raise ValueError('Source history session unavailable')
            token=match[1]
        finally:session['cleanup']()
        days=context['days']
        if type(days) is not int or not 1<=days<=3600:raise ValueError('History window budget')
        window=next(size for size in (360,720,1080,1800,3600) if days<=size)
        # Source-owned anonymous chart session, not a user login or credential.
        url=f'https://live.mystocks.co.ke/graphs/chart/{slug}?mspgsid={quote(token,safe="")};r={window};f=d;t=avg;v=ovr;id={int(time.time())//86400};w=600'
        artifact=await self.io.downloader.fetch(url,request_headers={'Accept':'text/html','Referer':page,'X-MSL-Chart':token})
        return await self.io.persist(document,artifact,'mystocks',self.parser_version)
    async def parse(self,fetched):
        context=fetched['document']['context']
        rows=chart_closes(self.io.text(fetched['artifact'],4*1024*1024),context['from'],context['to'])
        if not rows:raise ValueError('Source returned no verified close observations')
        return {'method':'html','confidence':.8,'text':'Source close-only history for '+context['ticker'],'tables':rows,'entity':{'ticker':context['ticker'],'exchange':'NSE'},'needsReview':True}
