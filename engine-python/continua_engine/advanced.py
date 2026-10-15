"""User-supplied research, with bounded validation before calculation."""
import math
from datetime import date
from urllib.parse import urlsplit
from .numbers import finite
from .risk import total_return_series
from .factor_research import factor_research,total,mean
from .notebook import text,timestamp

def calendar(v):
    try: return isinstance(v,str) and len(v)==10 and date.fromisoformat(v).isoformat()==v
    except ValueError: return False

def source(v):
    try:
        u=urlsplit(v)
        return isinstance(v,str) and len(v)<=2048 and v.startswith('https://') and bool(u.hostname) and not u.username and not u.password
    except (TypeError,ValueError): return False

def number(v,lo,hi,integer=False): return finite(v) and lo<=v<=hi and (not integer or int(v)==v)
def exact(v,required,optional=()): return isinstance(v,dict) and set(required)<=set(v) and set(v)<=set(required)|set(optional)
def points(v): return isinstance(v,list) and 2<=len(v)<=1500 and all(exact(p,['date','close']) and calendar(p['date']) and number(p['close'],1e-8,1e15) for p in v)

def validate(v):
    if not isinstance(v,dict): return False
    kind=v.get('kind')
    if kind=='cross-asset':
        return exact(v,['kind','currency','positions']) and v['currency']=='KES' and isinstance(v['positions'],list) and 1<=len(v['positions'])<=100 and all(exact(p,['name','assetClass','value','asOf','sourceUrl']) and text(p['name'],1,80) is not None and p['assetClass'] in ('equity','bond','cash','futures-collateral') and number(p['value'],0,1e15) and calendar(p['asOf']) and source(p['sourceUrl']) for p in v['positions'])
    if kind=='factor-risk':
        return exact(v,['kind','sourceUrl','basis','factorSources','observations']) and source(v['sourceUrl']) and v['basis'] in ('price','total-return') and isinstance(v['factorSources'],dict) and 1<=len(v['factorSources'])<=3 and all(source(u) for u in v['factorSources'].values()) and isinstance(v['observations'],list) and 180<=len(v['observations'])<=1500 and all(exact(p,['date','portfolioReturn','factors']) and calendar(p['date']) and number(p['portfolioReturn'],-.95,5) and isinstance(p['factors'],dict) and 1<=len(p['factors'])<=3 and all(number(n,-.95,5) for n in p['factors'].values()) for p in v['observations'])
    required=['kind','points','sourceUrl'];optional=['additionalSourceUrls']
    if kind=='total-return': required+=['actions','actionCoverageConfirmed']
    elif kind=='benchmark': required+=['benchmark','benchmarkSourceUrl','basis']
    elif kind=='bootstrap': required+=['paths','horizon','seed','blockSize']
    elif kind=='replay': required+=['start','end']
    else: return False
    if not exact(v,required,optional) or not points(v['points']) or not source(v['sourceUrl']): return False
    if 'additionalSourceUrls' in v and (not isinstance(v['additionalSourceUrls'],list) or len(v['additionalSourceUrls'])>1500 or not all(source(u) for u in v['additionalSourceUrls'])): return False
    if kind=='benchmark': return points(v['benchmark']) and source(v['benchmarkSourceUrl']) and v['basis'] in ('price','total-return')
    if kind=='replay': return calendar(v['start']) and calendar(v['end'])
    if kind=='bootstrap': return all(number(v[k],lo,hi,True) for k,lo,hi in [('paths',100,1000),('horizon',1,252),('seed',1,2147483646),('blockSize',1,20)])
    return v['actionCoverageConfirmed'] is True and isinstance(v['actions'],list) and len(v['actions'])<=300 and all(exact(a,['date','sourceUrl'],['splitRatio','dividend']) and calendar(a['date']) and source(a['sourceUrl']) and ('splitRatio' not in a or number(a['splitRatio'],1e-300,1000)) and ('dividend' not in a or number(a['dividend'],0,1e12)) for a in v['actions'])

def checked(p,today):
    p=sorted(p,key=lambda p:p['date'])
    if len({x['date'] for x in p})!=len(p) or any(x['date']>today for x in p): raise ValueError('Duplicate or future observations cannot be used.')
    return p

def returns(p):
    if any((date.fromisoformat(p[i]['date'])-date.fromisoformat(p[i-1]['date'])).days>4 for i in range(1,len(p))): raise ValueError('History gaps exceed four calendar days. Supply continuous observed sessions; missing sessions are never interpolated.')
    return [p[i]['close']/p[i-1]['close']-1 for i in range(1,len(p))]

def advanced_research(v,now):
    today=now[:10];kind=v['kind']
    common={'generatedAt':timestamp(now).isoformat(timespec='milliseconds').replace('+00:00','Z'),'kind':kind,'inputVerification':'User-supplied research inputs; a source URL is not independent verification. No uploaded data is published into company financials.','methodVersion':'advanced-research-v1'}
    if kind=='factor-risk':
        rows=checked(v['observations'],today);returns([{'date':r['date'],'close':1} for r in rows])
        if set(rows[0]['factors'])!=set(v['factorSources']): raise ValueError('Every factor requires exactly one source mapping.')
        return {**common,**factor_research(rows),'sources':[v['sourceUrl']]+list(v['factorSources'].values()),'basis':v['basis']}
    if kind=='cross-asset':
        positions=[{**p,'name':text(p['name'],1,80)} for p in v['positions']]
        if any(p['asOf']>today for p in positions): raise ValueError('Future valuations are unavailable.')
        if len({p['asOf'] for p in positions})!=1: raise ValueError('Use one common valuation date before aggregating asset classes.')
        value=total(p['value'] for p in positions)
        if value<=0: raise ValueError('Positive covered value required.')
        return {**common,'totalValue':value,'currency':'KES','asOf':positions[0]['asOf'],'positions':[{**p,'weightPercent':p['value']/value*100} for p in positions],
            'methodology':'Manual covered net-asset-value inventory, not synchronized account holdings. Futures collateral is included only once; futures notional is not an asset value. No FX conversion or cross-asset risk aggregation.'}
    p=checked(v['points'],today);sources=list(dict.fromkeys([v['sourceUrl']]+v.get('additionalSourceUrls',[])))
    if kind=='total-return':
        if any(a['date']<p[0]['date'] or a['date']>p[-1]['date'] for a in v['actions']): raise ValueError('Actions must be inside the supplied history window.')
        returns(p);curve=total_return_series(p,v['actions'])
        if any(not finite(x['index']) for x in curve): raise ValueError('Adjustment overflow; action mappings require review.')
        return {**common,'curve':curve,'sources':sources+[a['sourceUrl'] for a in v['actions']],'totalReturnPercent':curve[-1]['index']-100,
            'methodology':'Gross split/dividend total-return index rebased to 100; distributions reinvested at the ex-date close. User confirms complete event coverage. Rights issues, taxes, costs and withholding are unsupported; use a separately verified adjustment mapping for them.'}
    if kind=='replay':
        if v['start']>=v['end'] or v['end']>today: raise ValueError('Select a past ordered start/end window.')
        selected=[x for x in p if v['start']<=x['date']<=v['end']]
        if len(selected)<2 or selected[0]['date']!=v['start'] or selected[-1]['date']!=v['end']: raise ValueError('Both selected endpoints must be observed sessions.')
        returns(selected);peak=selected[0]['close'];worst=0
        for x in selected: peak=max(peak,x['close']);worst=min(worst,x['close']/peak-1)
        return {**common,'curve':[{'date':x['date'],'index':100*x['close']/selected[0]['close']} for x in selected],'sources':sources,'start':v['start'],'end':v['end'],
            'returnPercent':100*(selected[-1]['close']/selected[0]['close']-1),'maxDrawdownPercent':worst*100,'methodology':'Replay of supplied observed price closes, not a named event reconstruction, actual account return or future forecast. Dividends and costs excluded.'}
    if kind=='benchmark':
        b=checked(v['benchmark'],today)
        if [x['date'] for x in p]!=[x['date'] for x in b]: raise ValueError('Portfolio and benchmark must have identical observed dates.')
        r,br=returns(p),returns(b)
        if len(r)<60: raise ValueError('At least 60 aligned returns required.')
        variance=lambda x:total((v-mean(x))**2 for v in x)/(len(x)-1)
        active=[x-br[i] for i,x in enumerate(r)];tracking=math.sqrt(variance(active))*math.sqrt(252);m=mean(active)
        cov=total((x-mean(r))*(br[i]-mean(br)) for i,x in enumerate(r))/(len(r)-1);bv=variance(br)
        return {**common,'sources':sources+[v['benchmarkSourceUrl']],'basis':v['basis'],'observations':len(r),'activeReturnPercent':100*(p[-1]['close']/p[0]['close']-b[-1]['close']/b[0]['close']),
            'trackingErrorPercent':tracking*100,'informationRatio':m*252/tracking if tracking>1e-12 else None,'beta':cov/bv if bv>1e-18 else None,
            'curve':[{'date':x['date'],'index':x['close']/p[0]['close']*100,'benchmark':b[i]['close']/b[0]['close']*100} for i,x in enumerate(p)],
            'methodology':'Arithmetic daily active returns; tracking error and information ratio annualized at 252 sessions. User declares matching price/total-return basis. Portfolio series must already be flow-adjusted; this tool does not infer cash flows, attribution or fees.'}
    r=returns(p);block=int(v['blockSize']);horizon=int(v['horizon'])
    if len(r)<120 or len(r)<block*6: raise ValueError('At least 120 continuous daily returns and six complete sampling blocks required.')
    seed=int(v['seed']);paths=[];outcomes=[]
    for _ in range(int(v['paths'])):
        path=[100]
        while len(path)<=horizon:
            seed=seed*16807%2147483647;start=math.floor(((seed-1)/2147483646)*(len(r)-block+1))
            for j in range(block):
                if len(path)>horizon: break
                value=path[-1]*(1+r[start+j])
                if not finite(value): raise ValueError('Simulation overflow; inputs require review.')
                path.append(value)
        paths.append(path);outcomes.append(path[-1]-100)
    percentile=lambda x,q:sorted(x)[math.floor((len(x)-1)*q)]
    return {**common,'sources':sources,'observations':len(r),'seed':v['seed'],'blockSize':v['blockSize'],'horizon':v['horizon'],'paths':v['paths'],
        'p05ReturnPercent':percentile(outcomes,.05),'medianReturnPercent':percentile(outcomes,.5),'p95ReturnPercent':percentile(outcomes,.95),
        'curve':[{'date':f'Session {i}','index':percentile([p[i] for p in paths],.5),'band':[percentile([p[i] for p in paths],.05),percentile([p[i] for p in paths],.95)]} for i in range(horizon+1)],
        'methodology':'Seeded moving-block bootstrap resamples observed daily price returns with replacement. Bands describe this chosen empirical model, not calibrated real-world probabilities or maximum losses. Assumes sampled history is representative; unobserved crises, corporate actions and costs are excluded.'}

def run_advanced(raw,now):
    if not validate(raw): return {'status':400,'error':'Invalid advanced research input'}
    try: return {'status':200,'data':advanced_research(raw,now)}
    except (ValueError,OverflowError) as e: return {'status':422,'error':str(e)}
