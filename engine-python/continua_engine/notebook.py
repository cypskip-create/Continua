"""Private forecast validation/calibration; no leaderboard or rewards."""
import math
import re
from datetime import datetime, timedelta
from urllib.parse import urlsplit
from .numbers import finite
from .publication import WHITESPACE

def timestamp(v):
    try:
        if not isinstance(v,str): return None
        at=datetime.fromisoformat(v.replace('Z','+00:00'))
        return at if at.tzinfo else None
    except ValueError: return None

def text(v,minimum,maximum):
    if not isinstance(v,str): return None
    value=v.strip(WHITESPACE);length=len(value.encode('utf-16-le',errors='surrogatepass'))//2
    return value if minimum<=length<=maximum else None

def validate_forecast(action,raw,now):
    if not isinstance(raw,dict): return {'valid':False}
    fields={'create':{'symbol','question','rules','deadline','probability','rationale'},'revise':{'probability','rationale'},'resolve':{'outcome','sourceUrl','note'}}
    if action not in fields or set(raw)!=fields[action]: return {'valid':False}
    saved={}
    if action in ('create','revise'):
        p=raw['probability'];rationale=text(raw['rationale'],5,2000)
        if not finite(p) or not 0<=p<=1 or rationale is None: return {'valid':False}
        saved.update({'probability':p,'rationale':rationale})
    if action=='create':
        symbol=text(raw['symbol'],1,20);symbol=symbol.upper() if symbol else ''
        question,rules=text(raw['question'],10,400),text(raw['rules'],20,2000)
        deadline=raw['deadline'];at=timestamp(deadline);current=timestamp(now)
        if not re.fullmatch(r'[A-Z0-9.\-]{1,20}',symbol) or question is None or rules is None or current is None or at is None or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z',deadline) or not current<at<current+timedelta(days=3660): return {'valid':False}
        saved.update({'symbol':symbol,'question':question,'rules':rules,'deadline':deadline})
    if action=='resolve':
        source=raw['sourceUrl'];note=text(raw['note'],10,2000)
        try: parsed=urlsplit(source)
        except (TypeError,ValueError): return {'valid':False}
        if raw['outcome'] not in ('yes','no','void') or note is None or not isinstance(source,str) or not source.startswith('https://') or len(source)>2048 or not parsed.hostname or parsed.username or parsed.password: return {'valid':False}
        saved.update({'outcome':raw['outcome'],'sourceUrl':source,'note':note})
    return {'valid':True,'data':saved}

def private_calibration(rows):
    if not isinstance(rows,list) or len(rows)>100: raise ValueError('notebook row limit')
    valid=[]
    for row in rows:
        deadline,resolved=timestamp(row.get('deadline')),timestamp(row.get('resolved_at'));revisions=row.get('revisions')
        if row.get('status')!='resolved' or type(row.get('outcome')) is not bool or deadline is None or resolved is None or resolved<deadline or not isinstance(revisions,list) or not revisions: continue
        if all(isinstance(v,dict) and finite(v.get('probability')) and 0<=v['probability']<=1 and timestamp(v.get('at')) is not None and timestamp(v['at'])<deadline for v in revisions): valid.append(row)
    def mean(values):
        # Python 3.12's compensated float sum differs from the sequential
        # JavaScript reduction. Keep the existing reproducible wire numbers.
        total=0
        for value in values: total+=value
        return total/len(values) if values else None
    bins=[]
    for i in range(5):
        members=[r for r in valid if min(4,math.floor(r['revisions'][-1]['probability']*5))==i]
        bins.append({'range':f'{i*20}–{(i+1)*20}%','count':len(members),'meanProbability':mean([r['revisions'][-1]['probability'] for r in members]),'observedYesRate':mean([int(r['outcome']) for r in members])})
    return {'resolvedCount':len(valid),'initialBrier':mean([(r['revisions'][0]['probability']-int(r['outcome']))**2 for r in valid]),
        'latestBrier':mean([(r['revisions'][-1]['probability']-int(r['outcome']))**2 for r in valid]),'bins':bins,
        'methodology':'Private binary Brier error: (probability − outcome)²; lower is better. Initial and latest pre-deadline forecasts are scored separately, not time-weighted. Outcomes are user-reported with linked evidence, not independently verified. Voids excluded; small samples do not establish forecasting skill.',
        'warning':'Fewer than 20 resolved questions: calibration is descriptive and highly uncertain.' if len(valid)<20 else None}
