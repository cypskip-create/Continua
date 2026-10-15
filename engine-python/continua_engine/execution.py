"""Historical research from recorded OHLCV, never invented trade volume."""
import math
from datetime import datetime
from . import indicators
from .numbers import finite

def rnd(v): return math.floor(v * 100 + .5) / 100
def instant(v): return datetime.fromisoformat(v.replace('Z', '+00:00'))

def valid_bars(bars):
    if not isinstance(bars, list) or len(bars) > 50000: raise ValueError('history size')
    previous = None
    for b in bars:
        if not all(finite(b.get(k)) for k in ('open','high','low','close','volume')): return False
        at = instant(b['timestamp'])
        if previous is not None and at <= previous: raise ValueError('unordered or duplicate history')
        previous = at
        if min(b['open'],b['close'],b['low']) <= 0 or b['volume'] < 0 or b['high'] < max(b['open'],b['close'],b['low']) or b['low'] > min(b['open'],b['close']): return False
    return True

def simulate_execution(bars, signals, options):
    if not valid_bars(bars) or len(signals) != len(bars): raise ValueError('recorded OHLCV required')
    capital = options['initialCapital']
    if not finite(capital) or capital <= 0: raise ValueError('capital')
    fee, slip, participation = options['feeBps']/10000, options['slippageBps']/10000, options['maxVolumeParticipation']
    if not all(finite(v) for v in (fee,slip,participation)) or not 0<=fee<=.05 or not 0<=slip<=.05 or not 0<participation<=.2: raise ValueError('execution assumptions')
    cash, shares, entry, peak, drawdown, skipped = capital,0,None,capital,0,0
    trades, equity = [],[]
    for i,b in enumerate(bars):
        signal = signals[i-1] if i else 'hold'
        if signal=='buy' and shares==0:
            price=b['open']*(1+slip);quantity=cash/(price*(1+fee))
            if b['volume']<=0 or quantity>b['volume']*participation: skipped+=1
            else: shares,entry,cash=quantity,{'date':b['timestamp'],'price':price,'cost':cash},0
        elif signal=='sell' and entry and shares>0:
            if b['volume']<=0 or shares>b['volume']*participation: skipped+=1
            else:
                price=b['open']*(1-slip);cash=shares*price*(1-fee)
                days=math.floor((instant(b['timestamp'])-instant(entry['date'])).total_seconds()/86400+.5)
                trades.append({'entryDate':entry['date'],'entryPrice':entry['price'],'exitDate':b['timestamp'],'exitPrice':price,'returnPercent':(cash/entry['cost']-1)*100,'holdingDays':days})
                entry,shares=None,0
        value=cash+shares*b['close'];peak=max(peak,value);drawdown=max(drawdown,(peak-value)/peak if peak>0 else 0)
        equity.append({'date':b['timestamp'],'value':value})
    return {'trades':trades,'equity':equity,'skipped':skipped,'openPosition':shares>0,'totalReturnPercent':(equity[-1]['value']/capital-1)*100 if equity else 0,'maxDrawdownPercent':drawdown*100}

def backtest(bars, req, actions):
    if len(bars)<5 or not valid_bars(bars): return None
    for a in actions:
        at=a.get('effectiveDate') or a.get('exDate') or ''
        if a.get('type') in ('split','bonus_issue') and a.get('status')!='cancelled' and req['from'][:10]<=at<=req['to'][:10]:
            return {'blocked':'Backtest crosses a corporate action whose historical price adjustment basis is unverified.'}
    signals=['hold']*len(bars);strategy=req['strategy']
    if strategy in ('sma_cross','ema_cross'):
        params={'fastPeriod':req.get('fastPeriod',10),'slowPeriod':req.get('slowPeriod',30)}
        calc=indicators.sma if strategy=='sma_cross' else indicators.ema
        fast,slow=calc(bars,params['fastPeriod']),calc(bars,params['slowPeriod'])
        for i in range(1,len(bars)):
            f0,f1,s0,s1=fast[i-1],fast[i],slow[i-1],slow[i]
            if None not in (f0,f1,s0,s1):
                if f0<=s0 and f1>s1: signals[i]='buy'
                elif f0>=s0 and f1<s1: signals[i]='sell'
    elif strategy=='rsi_reversion':
        params={'rsiPeriod':req.get('rsiPeriod',14),'oversold':req.get('oversold',30),'overbought':req.get('overbought',70)}
        line=indicators.rsi(bars,params['rsiPeriod'])
        for i in range(1,len(bars)):
            if line[i-1] is not None and line[i] is not None:
                if line[i-1]<=params['oversold'] and line[i]>params['oversold']: signals[i]='buy'
                elif line[i-1]>=params['overbought'] and line[i]<params['overbought']: signals[i]='sell'
    else: raise ValueError('strategy')
    options={k:req.get(k,v) for k,v in {'feeBps':20,'slippageBps':10,'initialCapital':100000,'maxVolumeParticipation':.01}.items()}
    result=simulate_execution(bars,signals,options);trades=result['trades'];n=len(trades);split=math.floor(len(bars)*.7)
    training=simulate_execution(bars[:split],signals[:split],options);test=simulate_execution(bars[split:],signals[split:],options)
    return {'symbol':req['symbol'],'exchange':req['exchange'],'strategy':strategy,'params':params,'from':req['from'],'to':req['to'],'trades':trades,
        'metrics':{'totalTrades':n,'winRate':rnd(sum(t['returnPercent']>0 for t in trades)/n*100) if n else None,'totalReturnPercent':rnd(result['totalReturnPercent']),
            'buyHoldReturnPercent':rnd((bars[-1]['close']-bars[0]['close'])/bars[0]['close']*100),'maxDrawdownPercent':rnd(result['maxDrawdownPercent']),
            'averageHoldingDays':rnd(sum(t['holdingDays'] for t in trades)/n) if n else None},
        'execution':{**options,'skipped':result['skipped'],'openPosition':result['openPosition']},
        'evaluation':{'inSampleReturn':training['totalReturnPercent'],'outOfSampleReturn':test['totalReturnPercent'] if len(bars)-split>=20 else None,'splitDate':bars[split]['timestamp']},
        'caveat':'Prior-session signals execute at the next session open. Includes configured fees and slippage; rejects orders above configured session-volume participation. Open positions are marked to the final close. Historical volume is a coarse execution constraint, not order-book simulation. Dividends and taxes are excluded; 70/30 chronological evaluation is not a forecast.'}

def volume_profile(bars,symbol,exchange,start,end,count=24):
    if not bars or not valid_bars(bars): return None
    if type(count) is not int or not 1<=count<=200: raise ValueError('bucket count')
    low,high=min(b['low'] for b in bars),max(b['high'] for b in bars)
    if high<=low: return None
    width=(high-low)/count
    buckets=[{'priceLow':rnd(low+i*width),'priceHigh':rnd(low+(i+1)*width),'priceMid':rnd(low+(i+.5)*width),'volume':0} for i in range(count)]
    for b in bars:
        span=b['high']-b['low'];first=max(0,math.floor((b['low']-low)/width));last=min(count-1,math.floor((b['high']-low)/width))
        if span<=0 or first==last:
            i=min(count-1,max(0,math.floor((b['close']-low)/width)));buckets[i]['volume']+=b['volume']
        else:
            for i in range(first,last+1):
                overlap=max(0,min(b['high'],buckets[i]['priceHigh'])-max(b['low'],buckets[i]['priceLow']))
                buckets[i]['volume']+=b['volume']*(overlap/span)
    for b in buckets: b['volume']=math.floor(b['volume']+.5)
    total=sum(b['volume'] for b in buckets);poc=max(range(count),key=lambda i:buckets[i]['volume']);lo=hi=poc;enclosed=buckets[poc]['volume']
    while enclosed<total*.7 and (lo>0 or hi<count-1):
        below=buckets[lo-1]['volume'] if lo>0 else -1;above=buckets[hi+1]['volume'] if hi<count-1 else -1
        if above>=below: hi+=1;enclosed+=buckets[hi]['volume']
        else: lo-=1;enclosed+=buckets[lo]['volume']
    return {'symbol':symbol,'exchange':exchange,'from':start,'to':end,'buckets':buckets,'pointOfControl':buckets[poc]['priceMid'],
        'valueAreaLow':buckets[lo]['priceLow'],'valueAreaHigh':buckets[hi]['priceHigh'],'totalVolume':total,
        'caveat':"Approximated from daily OHLCV: each day's volume is spread evenly across that day's high-low range, not from true intraday trade prints. Directionally useful over weeks/months; not a substitute for an intraday profile on a single day."}
