"""Strict user-assumption schemas for the retained native Python risk core."""
import pathlib
import sys
from datetime import date
from .advanced import calendar,exact,number
from .valuation import annual_ratio_at
from .notebook import timestamp
from .risk import portfolio_overview

def stress_workspace(raw,owned_positions,now):
    if not isinstance(raw,dict) or not set(raw).issubset({'marketShock','sectorShocks'}) or 'marketShock' not in raw or not number(raw['marketShock'],-.9,1):
        return {'status':400,'error':'Invalid Engine lab assumptions'}
    sectors=raw.get('sectorShocks',{})
    if not isinstance(sectors,dict) or len(sectors)>20 or any(not isinstance(k,str) or not 1<=len(k.encode('utf-16-le'))//2<=80 or not number(v,-.9,1) for k,v in sectors.items()):
        return {'status':400,'error':'Invalid Engine lab assumptions'}
    overview=portfolio_overview(owned_positions,'NSE',now);current=timestamp(now)
    positions=[{'symbol':p['symbol'],'value':p['value'],'sector':p['sector'],'asOf':p.get('asOf')} for p in overview['positions'] if timestamp(p.get('asOf')) is not None and timestamp(p['asOf'])<=current]
    if not overview['available'] or not positions:
        return {'status':422,'error':'Dated priced holdings are required for portfolio stress'}
    if any(k not in {p['sector'] for p in positions} for k in sectors):
        return {'status':400,'error':'Select a sector present in your portfolio'}
    sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'backend'/'python'))
    from engine_calculations import calculate
    result=calculate('stress',[positions,raw['marketShock'],sectors])
    warnings=overview['warnings']+(['Undated or future-dated holdings were excluded from this scenario.'] if len(positions)!=len(overview['positions']) else [])
    return {'status':200,'data':{**result,'coverage':overview['coverage'],'datedQuoteCoverage':f"{len(positions)}/{len(overview['positions'])}",'warnings':warnings,'generatedAt':now}}

def earnings_lab(raw,bundle,now):
    fields=['symbol','years','growthPercent','exitPe']
    if not exact(raw,fields) or not isinstance(raw['symbol'],str) or not number(raw['years'],1,10,True) or not number(raw['growthPercent'],-80,100) or not number(raw['exitPe'],1,100):
        return {'status':400,'error':'Invalid Engine lab assumptions'}
    quote=bundle.get('quote') or {};at=timestamp(quote.get('timestamp'));current=timestamp(now)
    if at is None or current is None or at>current or quote.get('source')=='mock' or not number(quote.get('lastPrice'),1e-300,1e12):
        return {'status':422,'error':'A dated non-mock quote is required.'}
    history=[p for p in bundle.get('history',[]) if p.get('sourceUrls')]
    dated=annual_ratio_at(history,quote['lastPrice'],quote['timestamp'],'pe')
    if not dated['ratio'] or not dated['denominator']:
        return {'status':422,'error':'Positive EPS from a source-backed annual filing available on the quote date is required.'}
    sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'backend'/'python'))
    from engine_calculations import calculate
    try:
        result=calculate('earnings',[dated['denominator'],quote['lastPrice'],raw['years'],raw['growthPercent'],raw['exitPe']])
        return {'status':200,'data':{**result,'symbol':raw['symbol'].strip().upper(),'currency':bundle.get('currency'),'quoteAsOf':quote['timestamp'],'fiscalYear':dated['fiscalYear'],'sourceUrls':dated['sourceUrls'],'snapshotId':(bundle.get('reliability') or {}).get('snapshotId'),'generatedAt':now}}
    except (ValueError,OverflowError,ZeroDivisionError):
        return {'status':422,'error':'Calculation inputs require review.'}

def validate_lab(kind,raw):
    if kind=='futures':
        fields=['entry','settlement','multiplier','contracts','side','margin','expiry','asOf','shockPercent']
        return exact(raw,fields) and all(number(raw[k],1e-300,1e12) for k in ('entry','settlement','margin')) and number(raw['multiplier'],1e-300,1e6) and number(raw['contracts'],1,100000,True) and raw['side'] in ('long','short') and calendar(raw['expiry']) and calendar(raw['asOf']) and number(raw['shockPercent'],-90,100)
    if kind!='bond': return False
    fields=['settlement','previousCoupon','nextCoupon','couponPerPeriod','yieldPercent','frequency','cashFlows','shockBps']
    if not exact(raw,fields) or not all(calendar(raw[k]) for k in ('settlement','previousCoupon','nextCoupon')) or not number(raw['couponPerPeriod'],0,1e12) or not number(raw['yieldPercent'],0,100) or type(raw['frequency']) not in (int,float) or raw['frequency'] not in (1,2,4) or not number(raw['shockBps'],-1000,1000):return False
    flows=raw['cashFlows']
    if not isinstance(flows,list) or not 1<=len(flows)<=120 or not all(exact(f,['date','amount']) and calendar(f['date']) and number(f['amount'],.01,1e12) for f in flows): return False
    if raw['previousCoupon']>raw['settlement'] or raw['nextCoupon']<=raw['settlement']:return False
    span=(date.fromisoformat(raw['nextCoupon'])-date.fromisoformat(raw['previousCoupon'])).days
    if not 300/raw['frequency']<=span<=370/raw['frequency']:return False
    if raw['couponPerPeriod']>0 and not any(f['date']==raw['nextCoupon'] and f['amount']>=raw['couponPerPeriod'] for f in flows):return False
    if any(f['date']<=raw['settlement'] or (date.fromisoformat(f['date'])-date.fromisoformat(raw['settlement'])).days>60*365.25 for f in flows):return False
    return len({f['date'] for f in flows})==len(flows) and raw['yieldPercent']+raw['shockBps']/100>=0

def lab_calculation(kind,raw,now):
    if not validate_lab(kind,raw):return {'status':400,'error':'Invalid Engine lab assumptions'}
    sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'backend'/'python'))
    from engine_calculations import calculate
    try:return {'status':200,'data':{**calculate(kind,[raw]),'assumptions':raw,'generatedAt':now}}
    except (ValueError,OverflowError,ZeroDivisionError):return {'status':422,'error':'Calculation inputs require review.'}
